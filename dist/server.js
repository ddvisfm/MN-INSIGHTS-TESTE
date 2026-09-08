import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ConflictError, ValidationError, createClient, createReport, createDatabase, getClientDetail, getDashboard, getReportById, getReportByToken, listClients, listExports, listNotifications, markAllNotificationsRead, markNotificationRead, recordAudit, recordExport, submitReportFeedback } from './db.js';
import { authenticateAdmin, cleanupExpiredSessions, createAdminSession, createInitialAdmin, getAdminSession, hasAdminUser, revokeAdminSession } from './auth.js';
import { buildReportsXlsx, exportFilename } from './xlsx.js';
const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, '..');
const publicDir = path.join(here, 'public');
const dataPath = path.resolve(process.env.DATABASE_PATH ?? path.join(projectRoot, 'data', 'mn-insights.db'));
mkdirSync(path.dirname(dataPath), { recursive: true });
const db = createDatabase(dataPath);
cleanupExpiredSessions(db);
const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? '127.0.0.1';
const COOKIE_NAME = 'mn_internal_session';
const MIME = {
    '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
    '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json; charset=utf-8',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
};
const rateBuckets = new Map();
function clientKey(req) {
    if (process.env.TRUST_PROXY === '1') {
        const forwarded = req.headers['x-forwarded-for'];
        const value = Array.isArray(forwarded) ? forwarded[0] : forwarded;
        if (value)
            return String(value).split(',')[0].trim().slice(0, 80);
    }
    return String(req.socket.remoteAddress ?? 'local').slice(0, 80);
}
function allowRate(key, max, windowMs) {
    const now = Date.now();
    const current = rateBuckets.get(key);
    if (!current || current.resetAt <= now) {
        rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
        return true;
    }
    if (current.count >= max)
        return false;
    current.count += 1;
    return true;
}
function requestIsHttps(req) {
    const proto = req.headers['x-forwarded-proto'];
    return (Array.isArray(proto) ? proto[0] : proto) === 'https';
}
function applySecurityHeaders(req, res) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; img-src 'self' data:; connect-src 'self'; font-src 'self' https://fonts.gstatic.com; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
    if (requestIsHttps(req))
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
}
function json(req, res, status, body) {
    applySecurityHeaders(req, res);
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify(body));
}
function text(req, res, status, body) {
    applySecurityHeaders(req, res);
    res.statusCode = status;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(body);
}
function redirect(req, res, location) {
    applySecurityHeaders(req, res);
    res.statusCode = 302;
    res.setHeader('Location', location);
    res.setHeader('Cache-Control', 'no-store');
    res.end();
}
async function readJson(req) {
    return await new Promise((resolve, reject) => {
        const chunks = [];
        let size = 0;
        let rejected = false;
        req.on('data', (chunk) => {
            if (rejected)
                return;
            size += chunk.byteLength;
            if (size > 100_000) {
                rejected = true;
                reject(new ValidationError('Payload muito grande.'));
                return;
            }
            chunks.push(chunk);
        });
        req.on('end', () => {
            if (rejected)
                return;
            try {
                const joined = new Uint8Array(size);
                let offset = 0;
                for (const chunk of chunks) {
                    joined.set(chunk, offset);
                    offset += chunk.byteLength;
                }
                resolve(JSON.parse(new TextDecoder().decode(joined) || '{}'));
            }
            catch {
                reject(new ValidationError('JSON inválido.'));
            }
        });
        req.on('error', reject);
    });
}
function serveFile(req, res, filePath, cache = false) {
    if (!existsSync(filePath)) {
        text(req, res, 404, 'Arquivo não encontrado.');
        return;
    }
    applySecurityHeaders(req, res);
    const ext = path.extname(filePath);
    res.statusCode = 200;
    res.setHeader('Content-Type', MIME[ext] ?? 'application/octet-stream');
    res.setHeader('Cache-Control', cache ? 'public, max-age=86400, immutable' : 'no-cache');
    res.end(readFileSync(filePath));
}
function serveApp(req, res) { serveFile(req, res, path.join(publicDir, 'index.html')); }
function parseUrl(req) { return new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`); }
function cookieMap(req) {
    const header = req.headers.cookie;
    const raw = Array.isArray(header) ? header.join(';') : String(header ?? '');
    const map = new Map();
    for (const chunk of raw.split(';')) {
        const index = chunk.indexOf('=');
        if (index <= 0)
            continue;
        map.set(chunk.slice(0, index).trim(), decodeURIComponent(chunk.slice(index + 1).trim()));
    }
    return map;
}
function sessionToken(req) { return cookieMap(req).get(COOKIE_NAME) ?? null; }
function adminSession(req) { return getAdminSession(db, sessionToken(req)); }
function setSessionCookie(req, res, token) {
    const secure = requestIsHttps(req) ? '; Secure' : '';
    res.setHeader('Set-Cookie', `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${12 * 60 * 60}${secure}`);
}
function clearSessionCookie(req, res) {
    const secure = requestIsHttps(req) ? '; Secure' : '';
    res.setHeader('Set-Cookie', `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`);
}
function sameOrigin(req) {
    const origin = req.headers.origin;
    if (!origin)
        return true;
    const raw = Array.isArray(origin) ? origin[0] : origin;
    try {
        return new URL(raw ?? '').host === String(req.headers.host ?? '');
    }
    catch {
        return false;
    }
}
function requireCsrf(req, res, session) {
    if (!sameOrigin(req)) {
        json(req, res, 403, { error: 'Origem da requisição não autorizada.' });
        return false;
    }
    const header = req.headers['x-csrf-token'];
    const token = Array.isArray(header) ? header[0] : header;
    if (!token || token !== session.csrfToken) {
        json(req, res, 403, { error: 'Validação de segurança expirada. Atualize a página e tente novamente.' });
        return false;
    }
    return true;
}
function requireInternal(req, res) {
    const session = adminSession(req);
    if (!session) {
        json(req, res, 401, { error: 'Sessão interna necessária.' });
        return null;
    }
    return session;
}
function handleError(req, res, error) {
    if (error instanceof ConflictError) {
        json(req, res, 409, { error: error.message });
        return;
    }
    if (error instanceof ValidationError) {
        json(req, res, 400, { error: error.message, fieldErrors: error.fieldErrors });
        return;
    }
    console.error('[MN Insights]', error instanceof Error ? error.message : 'Erro desconhecido');
    json(req, res, 500, { error: 'Não foi possível concluir esta operação.' });
}
function sendXlsx(req, res, filename, bytes) {
    applySecurityHeaders(req, res);
    res.statusCode = 200;
    res.setHeader('Content-Type', MIME['.xlsx']);
    res.setHeader('Content-Disposition', `attachment; filename="${filename.replace(/["\r\n]/g, '_')}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.end(bytes);
}
async function handleAuthApi(req, res, url) {
    const method = req.method ?? 'GET';
    const pathName = url.pathname;
    if (pathName === '/api/auth/status' && method === 'GET') {
        const session = adminSession(req);
        json(req, res, 200, { authenticated: Boolean(session), needsSetup: !hasAdminUser(db), ...(session ? { user: session.user, csrfToken: session.csrfToken } : {}) });
        return true;
    }
    if (pathName === '/api/auth/setup' && method === 'POST') {
        if (!allowRate(`setup:${clientKey(req)}`, 6, 15 * 60_000)) {
            json(req, res, 429, { error: 'Muitas tentativas. Aguarde alguns minutos.' });
            return true;
        }
        if (!sameOrigin(req)) {
            json(req, res, 403, { error: 'Origem não autorizada.' });
            return true;
        }
        try {
            const payload = await readJson(req);
            const user = createInitialAdmin(db, payload);
            const created = createAdminSession(db, user);
            setSessionCookie(req, res, created.token);
            recordAudit(db, { actor: user.name, action: 'ADMIN_SETUP', entityType: 'AUTH', entityId: user.id });
            json(req, res, 201, { authenticated: true, needsSetup: false, user, csrfToken: created.session.csrfToken });
        }
        catch (error) {
            handleError(req, res, error);
        }
        return true;
    }
    if (pathName === '/api/auth/login' && method === 'POST') {
        if (!allowRate(`login:${clientKey(req)}`, 8, 15 * 60_000)) {
            json(req, res, 429, { error: 'Muitas tentativas de acesso. Aguarde alguns minutos.' });
            return true;
        }
        if (!sameOrigin(req)) {
            json(req, res, 403, { error: 'Origem não autorizada.' });
            return true;
        }
        try {
            const payload = await readJson(req);
            const user = authenticateAdmin(db, payload.email, payload.password);
            if (!user) {
                recordAudit(db, { actor: 'anonymous', action: 'LOGIN_FAILED', entityType: 'AUTH' });
                json(req, res, 401, { error: 'E-mail ou senha inválidos.' });
                return true;
            }
            const created = createAdminSession(db, user);
            setSessionCookie(req, res, created.token);
            recordAudit(db, { actor: user.name, action: 'LOGIN_SUCCESS', entityType: 'AUTH', entityId: user.id });
            json(req, res, 200, { authenticated: true, needsSetup: false, user, csrfToken: created.session.csrfToken });
        }
        catch (error) {
            handleError(req, res, error);
        }
        return true;
    }
    if (pathName === '/api/auth/logout' && method === 'POST') {
        const session = requireInternal(req, res);
        if (!session)
            return true;
        if (!requireCsrf(req, res, session))
            return true;
        revokeAdminSession(db, sessionToken(req));
        clearSessionCookie(req, res);
        recordAudit(db, { actor: session.user.name, action: 'LOGOUT', entityType: 'AUTH', entityId: session.user.id });
        json(req, res, 200, { ok: true });
        return true;
    }
    return false;
}
async function handlePublicApi(req, res, url) {
    const method = req.method ?? 'GET';
    const pathname = url.pathname;
    const reportMatch = pathname.match(/^\/api\/public\/reports\/([A-Za-z0-9_-]{16,80})$/);
    if (reportMatch && method === 'GET') {
        const rateKey = `public-get:${clientKey(req)}:${reportMatch[1]}`;
        if (!allowRate(rateKey, 120, 60 * 60_000)) {
            json(req, res, 429, { error: 'Muitas solicitações. Tente novamente em instantes.' });
            return true;
        }
        const report = getReportByToken(db, reportMatch[1]);
        if (!report)
            json(req, res, 404, { error: 'Este link de relatório é inválido ou não existe.' });
        else
            json(req, res, 200, { report, blocked: report.status === 'RESPONDED' });
        return true;
    }
    const submitMatch = pathname.match(/^\/api\/public\/reports\/([A-Za-z0-9_-]{16,80})\/submit$/);
    if (submitMatch && method === 'POST') {
        if (!sameOrigin(req)) {
            json(req, res, 403, { error: 'Origem não autorizada.' });
            return true;
        }
        const rateKey = `public-submit:${clientKey(req)}:${submitMatch[1]}`;
        if (!allowRate(rateKey, 12, 60 * 60_000)) {
            json(req, res, 429, { error: 'Muitas tentativas de envio. Aguarde antes de tentar novamente.' });
            return true;
        }
        try {
            const payload = await readJson(req);
            const report = submitReportFeedback(db, submitMatch[1], payload);
            recordAudit(db, { actor: 'CLIENT_TOKEN', action: 'REPORT_SUBMITTED', entityType: 'REPORT', entityId: report.id, metadata: { clientCode: report.clientCode } });
            json(req, res, 200, { report });
        }
        catch (error) {
            handleError(req, res, error);
        }
        return true;
    }
    return false;
}
async function handleInternalApi(req, res, url) {
    const session = requireInternal(req, res);
    if (!session)
        return true;
    const method = req.method ?? 'GET';
    const pathname = url.pathname;
    if (method !== 'GET' && method !== 'HEAD' && !requireCsrf(req, res, session))
        return true;
    if (pathname === '/api/dashboard' && method === 'GET') {
        json(req, res, 200, getDashboard(db, { clientCode: url.searchParams.get('client'), thesisSlug: url.searchParams.get('thesis'), status: url.searchParams.get('status') }));
        return true;
    }
    if (pathname === '/api/notifications' && method === 'GET') {
        const limit = Number(url.searchParams.get('limit') ?? 30);
        json(req, res, 200, listNotifications(db, Number.isFinite(limit) ? limit : 30));
        return true;
    }
    if (pathname === '/api/notifications/read-all' && method === 'POST') {
        json(req, res, 200, { updated: markAllNotificationsRead(db) });
        return true;
    }
    const notificationReadMatch = pathname.match(/^\/api\/notifications\/(\d+)\/read$/);
    if (notificationReadMatch && method === 'POST') {
        const found = markNotificationRead(db, Number(notificationReadMatch[1]));
        if (!found)
            json(req, res, 404, { error: 'Notificação não encontrada.' });
        else
            json(req, res, 200, { ok: true });
        return true;
    }
    if (pathname === '/api/clients' && method === 'GET') {
        json(req, res, 200, { clients: listClients(db) });
        return true;
    }
    if (pathname === '/api/clients' && method === 'POST') {
        try {
            const payload = await readJson(req);
            const client = createClient(db, payload);
            recordAudit(db, { actor: session.user.name, action: 'CLIENT_CREATED', entityType: 'CLIENT', entityId: client.code });
            json(req, res, 201, { client });
        }
        catch (error) {
            handleError(req, res, error);
        }
        return true;
    }
    if (pathname === '/api/reports' && method === 'POST') {
        try {
            const payload = await readJson(req);
            const report = createReport(db, payload);
            recordAudit(db, { actor: session.user.name, action: 'REPORT_CREATED', entityType: 'REPORT', entityId: report.id, metadata: { clientCode: report.clientCode } });
            json(req, res, 201, { report });
        }
        catch (error) {
            handleError(req, res, error);
        }
        return true;
    }
    const clientMatch = pathname.match(/^\/api\/clients\/(MN\d{3,})$/);
    if (clientMatch && method === 'GET') {
        const detail = getClientDetail(db, clientMatch[1]);
        if (!detail)
            json(req, res, 404, { error: 'Cliente não encontrado.' });
        else
            json(req, res, 200, detail);
        return true;
    }
    const reportMatch = pathname.match(/^\/api\/reports\/(\d+)$/);
    if (reportMatch && method === 'GET') {
        const report = getReportById(db, Number(reportMatch[1]));
        if (!report)
            json(req, res, 404, { error: 'Relatório não encontrado.' });
        else
            json(req, res, 200, { report });
        return true;
    }
    if (pathname === '/api/exports' && method === 'GET') {
        json(req, res, 200, { exports: listExports(db) });
        return true;
    }
    const reportExport = pathname.match(/^\/api\/exports\/report\/(\d+)$/);
    if (reportExport && method === 'POST') {
        if (!allowRate(`export:${session.user.id}`, 30, 60 * 60_000)) {
            json(req, res, 429, { error: 'Limite de exportações atingido. Tente novamente mais tarde.' });
            return true;
        }
        const report = getReportById(db, Number(reportExport[1]));
        if (!report) {
            json(req, res, 404, { error: 'Relatório não encontrado.' });
            return true;
        }
        const reports = [report];
        const filename = exportFilename(reports);
        const bytes = buildReportsXlsx(reports);
        recordExport(db, { scope: 'REPORT', clientCode: report.clientCode, reportId: report.id, filename, recordCount: 1, createdBy: session.user.name });
        recordAudit(db, { actor: session.user.name, action: 'EXPORT_REPORT', entityType: 'REPORT', entityId: report.id });
        sendXlsx(req, res, filename, bytes);
        return true;
    }
    if (pathname === '/api/exports/general' && method === 'POST') {
        if (!allowRate(`export:${session.user.id}`, 30, 60 * 60_000)) {
            json(req, res, 429, { error: 'Limite de exportações atingido. Tente novamente mais tarde.' });
            return true;
        }
        try {
            const filters = await readJson(req);
            const reports = getDashboard(db, { clientCode: filters.clientCode ?? null, status: filters.status ?? null }).reports;
            if (!reports.length) {
                json(req, res, 400, { error: 'Não existem relatórios no filtro atual para exportar.' });
                return true;
            }
            const filename = exportFilename(reports);
            const bytes = buildReportsXlsx(reports);
            recordExport(db, { scope: 'GENERAL', clientCode: filters.clientCode ?? null, filename, recordCount: reports.length, createdBy: session.user.name });
            recordAudit(db, { actor: session.user.name, action: 'EXPORT_GENERAL', entityType: 'EXPORT', metadata: { reports: reports.length, clientCode: filters.clientCode ?? null, status: filters.status ?? null } });
            sendXlsx(req, res, filename, bytes);
        }
        catch (error) {
            handleError(req, res, error);
        }
        return true;
    }
    return false;
}
async function handleApi(req, res, url) {
    if (url.pathname === '/api/health' && (req.method ?? 'GET') === 'GET') {
        json(req, res, 200, { ok: true, product: 'MN Insights' });
        return true;
    }
    if (url.pathname.startsWith('/api/auth/'))
        return handleAuthApi(req, res, url);
    if (url.pathname.startsWith('/api/public/'))
        return handlePublicApi(req, res, url);
    return handleInternalApi(req, res, url);
}
function isPublicPage(pathname) {
    return pathname === '/login' || pathname === '/setup-admin' || /^\/r\/[A-Za-z0-9_-]{16,80}$/.test(pathname);
}
const server = createServer(async (req, res) => {
    try {
        const url = parseUrl(req);
        if (url.pathname.startsWith('/api/')) {
            const handled = await handleApi(req, res, url);
            if (!handled)
                json(req, res, 404, { error: 'Rota de API não encontrada.' });
            return;
        }
        if (url.pathname === '/styles.css') {
            serveFile(req, res, path.join(publicDir, 'styles.css'));
            return;
        }
        if (url.pathname === '/static/app.js') {
            serveFile(req, res, path.join(here, 'client', 'app.js'));
            return;
        }
        if (url.pathname === '/shared/report-progress.js') {
            serveFile(req, res, path.join(here, 'shared', 'report-progress.js'));
            return;
        }
        if (url.pathname.startsWith('/assets/')) {
            serveFile(req, res, path.join(publicDir, 'assets', path.basename(url.pathname)), true);
            return;
        }
        if (req.method !== 'GET') {
            text(req, res, 405, 'Método não permitido.');
            return;
        }
        const session = adminSession(req);
        if (isPublicPage(url.pathname)) {
            if ((url.pathname === '/login' || url.pathname === '/setup-admin') && session) {
                redirect(req, res, '/dashboard');
                return;
            }
            if (url.pathname === '/login' && !hasAdminUser(db)) {
                redirect(req, res, '/setup-admin');
                return;
            }
            if (url.pathname === '/setup-admin' && hasAdminUser(db)) {
                redirect(req, res, '/login');
                return;
            }
            serveApp(req, res);
            return;
        }
        if (!session) {
            redirect(req, res, hasAdminUser(db) ? '/login' : '/setup-admin');
            return;
        }
        serveApp(req, res);
    }
    catch (error) {
        handleError(req, res, error);
    }
});
server.listen(port, host, () => {
    console.log(`MN Insights disponível em http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`);
    console.log(`Banco local: ${dataPath}`);
    if (!hasAdminUser(db))
        console.log('Primeiro acesso: abra /setup-admin para criar o usuário interno.');
});
//# sourceMappingURL=server.js.map