import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { rmSync } from 'node:fs';
import path from 'node:path';

const port = 31427;
const dbPath = path.join('/tmp', `mn-insights-security-${process.pid}.db`);
const base = `http://127.0.0.1:${port}`;

async function waitForServer() {
  for (let i = 0; i < 40; i += 1) {
    try { const response = await fetch(`${base}/api/health`); if (response.ok) return; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 75));
  }
  throw new Error('Servidor de teste não iniciou.');
}

test('rotas internas exigem sessão e mutações exigem CSRF', async () => {
  rmSync(dbPath, { force: true });
  const child = spawn(process.execPath, ['dist/server.js'], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', DATABASE_PATH: dbPath },
    stdio: 'ignore'
  });
  try {
    await waitForServer();

    const browserApp = await fetch(`${base}/static/app.js`);
    assert.equal(browserApp.status, 200);
    assert.match(await browserApp.text(), /shared\/report-progress\.js/);
    const browserProgressModule = await fetch(`${base}/shared/report-progress.js`);
    assert.equal(browserProgressModule.status, 200);
    assert.match(browserProgressModule.headers.get('content-type') ?? '', /javascript/);

    const unauthApi = await fetch(`${base}/api/dashboard`, { redirect: 'manual' });
    assert.equal(unauthApi.status, 401);
    const unauthPage = await fetch(`${base}/dashboard`, { redirect: 'manual' });
    assert.equal(unauthPage.status, 302);
    assert.equal(unauthPage.headers.get('location'), '/setup-admin');

    const setup = await fetch(`${base}/api/auth/setup`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Teste Interno', email: 'teste@mnmarketing.com.br', password: 'SenhaSegura2026!' })
    });
    assert.equal(setup.status, 201);
    const cookie = setup.headers.get('set-cookie')?.split(';')[0];
    assert.ok(cookie?.startsWith('mn_internal_session='));
    const state = await setup.json();
    assert.ok(state.csrfToken);

    const denied = await fetch(`${base}/api/clients`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Cliente Protegido', thesisSlugs: ['salario-maternidade'] })
    });
    assert.equal(denied.status, 403);

    const allowed = await fetch(`${base}/api/clients`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json', 'x-csrf-token': state.csrfToken },
      body: JSON.stringify({ name: 'Cliente Protegido', thesisSlugs: ['salario-maternidade'] })
    });
    assert.equal(allowed.status, 201);
    const allowedBody = await allowed.json();

    const createdReport = await fetch(`${base}/api/reports`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json', 'x-csrf-token': state.csrfToken },
      body: JSON.stringify({
        clientCode: allowedBody.client.code,
        periodStart: '2026-08-31',
        periodEnd: '2026-09-06',
        metrics: [{ thesisSlug: 'salario-maternidade', investmentCents: 100000, leads: 50, cpcCents: 250 }]
      })
    });
    assert.equal(createdReport.status, 201);
    const createdReportBody = await createdReport.json();

    const publicSubmit = await fetch(`${base}/api/public/reports/${createdReportBody.report.token}/submit`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: base },
      body: JSON.stringify({ answers: [{
        thesisId: createdReportBody.report.metrics[0].thesisId, attendance: 'MOST', attendanceCount: 12, quality: 'GOOD',
        contractStatus: 'NO', contractCount: null, negotiationCount: null, problems: ['NONE'],
        otherProblem: '', campaignObservation: '', agencyFeedback: ''
      }] })
    });
    assert.equal(publicSubmit.status, 200);

    const notifications = await fetch(`${base}/api/notifications`, { headers: { cookie } });
    assert.equal(notifications.status, 200);
    const notificationsBody = await notifications.json();
    assert.equal(notificationsBody.unreadCount, 1);
    assert.equal(notificationsBody.notifications[0].type, 'REPORT_RESPONDED');

    const deniedRead = await fetch(`${base}/api/notifications/${notificationsBody.notifications[0].id}/read`, {
      method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: '{}'
    });
    assert.equal(deniedRead.status, 403);
    const allowedRead = await fetch(`${base}/api/notifications/${notificationsBody.notifications[0].id}/read`, {
      method: 'POST', headers: { cookie, 'content-type': 'application/json', 'x-csrf-token': state.csrfToken }, body: '{}'
    });
    assert.equal(allowedRead.status, 200);
    const notificationsRead = await fetch(`${base}/api/notifications`, { headers: { cookie } });
    assert.equal((await notificationsRead.json()).unreadCount, 0);

    const exported = await fetch(`${base}/api/exports/general`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json', 'x-csrf-token': state.csrfToken },
      body: JSON.stringify({ clientCode: allowedBody.client.code, status: 'RESPONDED' })
    });
    assert.equal(exported.status, 200);
    assert.match(exported.headers.get('content-type') ?? '', /application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet/);
    assert.match(exported.headers.get('content-disposition') ?? '', /\.xlsx/i);
    const exportedBytes = new Uint8Array(await exported.arrayBuffer());
    assert.equal(exportedBytes[0], 0x50);
    assert.equal(exportedBytes[1], 0x4b);

    const publicPage = await fetch(`${base}/r/rpt_token_publico_teste_1234567890`, { redirect: 'manual' });
    assert.equal(publicPage.status, 200);

    const logout = await fetch(`${base}/api/auth/logout`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json', 'x-csrf-token': state.csrfToken },
      body: '{}'
    });
    assert.equal(logout.status, 200);

    const revokedSession = await fetch(`${base}/api/dashboard`, { headers: { cookie } });
    assert.equal(revokedSession.status, 401);

    const badLogin = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'teste@mnmarketing.com.br', password: 'SenhaIncorreta2026!' })
    });
    assert.equal(badLogin.status, 401);

    const goodLogin = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'teste@mnmarketing.com.br', password: 'SenhaSegura2026!' })
    });
    assert.equal(goodLogin.status, 200);
    const newCookie = goodLogin.headers.get('set-cookie')?.split(';')[0];
    assert.ok(newCookie?.startsWith('mn_internal_session='));
    const loggedState = await goodLogin.json();
    assert.ok(loggedState.csrfToken);

    const loggedDashboard = await fetch(`${base}/api/dashboard`, { headers: { cookie: newCookie } });
    assert.equal(loggedDashboard.status, 200);
  } finally {
    child.kill('SIGTERM');
    rmSync(dbPath, { force: true });
    rmSync(`${dbPath}-shm`, { force: true });
    rmSync(`${dbPath}-wal`, { force: true });
  }
});
