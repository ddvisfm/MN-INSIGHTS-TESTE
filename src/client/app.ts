import type {
  ApiError,
  AuthSessionPayload,
  ClientDetailPayload,
  ClientSummary,
  ContractStatus,
  CreateReportPayload,
  DashboardPayload,
  Feedback,
  FeedbackDraft,
  ExportRecord,
  LeadAttendance,
  LeadProblem,
  LeadQuality,
  Metrics,
  NotificationSummary,
  NotificationsPayload,
  PublicReportPayload,
  ReportStatus,
  ReportSummary,
  SubmitFeedbackPayload,
  ThesisSlug
} from '../shared/types.js';
import { calculateReportProgress } from '../shared/report-progress.js';

const appElement = document.querySelector<HTMLElement>('#app');
const toastElement = document.querySelector<HTMLElement>('#toast-region');
if (!appElement || !toastElement) throw new Error('Contêiner da aplicação não encontrado.');
const app: HTMLElement = appElement;
const toastRegion: HTMLElement = toastElement;

type AdminSection = 'dashboard' | 'clients' | 'reports' | 'theses';
type Theme = 'light' | 'dark';

let adminCsrfToken = '';
let adminUserName = 'Equipe MN';

const attendanceLabel: Record<LeadAttendance, string> = {
  FEW: 'Poucos', HALF: 'Cerca da metade', MOST: 'A maioria', ALL: 'Todos'
};
const qualityLabel: Record<LeadQuality, string> = {
  POOR: 'Ruim', REGULAR: 'Regular', GOOD: 'Boa', VERY_GOOD: 'Muito boa'
};
const contractLabel: Record<ContractStatus, string> = {
  YES: 'Sim', NO: 'Não', NEGOTIATING: 'Ainda estão em negociação'
};
const problemLabel: Record<LeadProblem, string> = {
  NO_PROFILE: 'Não tinham direito/perfil',
  NO_RESPONSE: 'Não responderam',
  NO_INTEREST: 'Sem interesse',
  HAS_LAWYER: 'Já tinham advogado',
  OUTSIDE_REGION: 'Fora da região/público',
  NONE: 'Nenhum problema relevante',
  OTHER: 'Outro'
};

function e(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function icon(name: string, size = 19): string {
  const paths: Record<string, string> = {
    dashboard: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    report: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/>',
    chart: '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>',
    plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
    arrow: '<line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>',
    back: '<line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>',
    external: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
    copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    check: '<polyline points="20 6 9 17 4 12"/>',
    clock: '<circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/>',
    bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/>',
    running: '<circle cx="14" cy="5" r="2"/><path d="m10 22 2-7 3 2 2 5"/><path d="m8 12 4-4 3 3 4 1"/><path d="m12 8-3 7-5 2"/>',
    trend: '<polyline points="3 17 9 11 13 15 21 7"/><polyline points="14 7 21 7 21 14"/>',
    search: '<circle cx="11" cy="11" r="7"/><line x1="20" y1="20" x2="16.65" y2="16.65"/>',
    filter: '<path d="M4 5h16M7 12h10M10 19h4"/>',
    spark: '<path d="m12 3 1.7 4.3L18 9l-4.3 1.7L12 15l-1.7-4.3L6 9l4.3-1.7L12 3Z"/><path d="m19 15 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z"/>',
    inbox: '<polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.5 5h13L22 12v7a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-7l3.5-7z"/>',
    alert: '<path d="M10.3 2.8 1.8 17a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 2.8a2 2 0 0 0-3.4 0Z"/><line x1="12" y1="8" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
    money: '<circle cx="12" cy="12" r="9"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><line x1="12" y1="6" x2="12" y2="18"/>',
    layers: '<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><line x1="16" y1="3" x2="16" y2="7"/><line x1="8" y1="3" x2="8" y2="7"/><line x1="3" y1="11" x2="21" y2="11"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/>',
    moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8Z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.66 6.34l1.41-1.41"/>',
    rocket: '<path d="M4.5 16.5c-1.5 1.5-2 4-2 4s2.5-.5 4-2c.9-.9.9-2.3 0-3.2s-2.3-.9-3.2 0Z"/><path d="m9 15-3-3s2.5-4.6 6.5-7.5C16 2 21 2 22 2c0 1 0 6-2.5 9.5C16.6 15.5 12 18 12 18l-3-3Z"/><path d="M13.5 6.5a2 2 0 1 0 4 0 2 2 0 0 0-4 0Z"/><path d="M9 15H5l-2 4 6-1M12 18v4l4-2 1-6"/>',
    chevron: '<polyline points="9 18 15 12 9 6"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1.1 1.1"/><path d="M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1.1-1.1"/>',
    eye: '<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="2.5"/>',
    eyeOff: '<path d="m3 3 18 18"/><path d="M10.6 5.2A11.7 11.7 0 0 1 12 5c6.5 0 10 7 10 7a18.7 18.7 0 0 1-2.1 3.1M6.6 6.6C3.6 8.6 2 12 2 12s3.5 7 10 7a10.8 10.8 0 0 0 4.2-.8"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>'
  };
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] ?? paths.report}</svg>`;
}

function money(cents: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
}

function shortDate(iso: string): string {
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', timeZone: 'UTC' }).format(new Date(`${iso}T12:00:00Z`)).replace('.', '');
}

function fullDate(iso: string): string {
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${iso}T12:00:00Z`)).replace('.', '');
}

function dateTime(iso: string | null): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(iso));
}

function period(report: Pick<ReportSummary, 'periodStart' | 'periodEnd'>): string {
  return `${shortDate(report.periodStart)} — ${fullDate(report.periodEnd)}`;
}

function brasiliaContext(): { greeting: string; date: string; hour: number } {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo', hour: '2-digit', hourCycle: 'h23', weekday: 'long', day: '2-digit', month: 'long'
  }).formatToParts(now);
  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? '12');
  const greeting = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
  const date = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo', weekday: 'long', day: '2-digit', month: 'long'
  }).format(now);
  return { greeting, date: date.charAt(0).toUpperCase() + date.slice(1), hour };
}

function thesisPills(report: ReportSummary): string {
  return `<div class="pill-stack">${report.theses.map((t) => `<span class="thesis-pill">${e(t.name)}</span>`).join('')}</div>`;
}

type ReportDisplayStatus = 'RESPONDED' | 'AWAITING' | 'LATE';

function saoPauloDate(value = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(value);
  const item = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${item.year ?? ''}-${item.month ?? ''}-${item.day ?? ''}`;
}

function todaySaoPaulo(): string {
  return saoPauloDate();
}

function calendarDayDiff(start: string, end: string): number {
  const startMs = Date.parse(`${start}T00:00:00.000Z`);
  const endMs = Date.parse(`${end}T00:00:00.000Z`);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return 0;
  return Math.max(0, Math.floor((endMs - startMs) / 86_400_000));
}

function waitingDays(report: ReportSummary): number {
  return calendarDayDiff(saoPauloDate(new Date(report.sentAt)), todaySaoPaulo());
}

function reportDisplayStatus(report: ReportSummary): ReportDisplayStatus {
  if (report.status === 'RESPONDED') return 'RESPONDED';
  return todaySaoPaulo() > report.periodEnd ? 'LATE' : 'AWAITING';
}

function statusBadge(report: ReportSummary): string {
  const status = reportDisplayStatus(report);
  const days = waitingDays(report);
  const label = status === 'RESPONDED'
    ? 'Respondido'
    : status === 'LATE'
      ? 'Atrasado'
      : days > 0 ? `Aguardando há ${days} ${days === 1 ? 'dia' : 'dias'}` : 'Aguardando';
  const klass = status === 'RESPONDED' ? 'badge-responded' : status === 'LATE' ? 'badge-late' : 'badge-awaiting';
  const statusGraphic = status === 'RESPONDED'
    ? '<img class="status-responded-rocket" src="/assets/rocket-status-responded.svg" alt="" />'
    : icon(status === 'LATE' ? 'running' : 'clock', 15);
  return `<span class="status-badge ${klass}"><span class="status-icon" aria-hidden="true">${statusGraphic}</span><span class="status-label">${e(label)}</span></span>`;
}

function clientAvatar(code: string, large = false): string {
  const number = code.replace(/^MN/i, '') || '—';
  return `<div class="client-avatar ${large ? 'large' : ''}" aria-hidden="true"><strong>MN</strong><small>${e(number)}</small></div>`;
}

function toast(message: string, kind: 'success' | 'error' | '' = ''): void {
  const el = document.createElement('div');
  el.className = `toast ${kind}`.trim();
  el.textContent = message;
  toastRegion.appendChild(el);
  window.setTimeout(() => el.remove(), 3500);
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const method = String(init?.method ?? 'GET').toUpperCase();
  const needsCsrf = !['GET', 'HEAD', 'OPTIONS'].includes(method) && !url.startsWith('/api/public/') && !url.startsWith('/api/auth/login') && !url.startsWith('/api/auth/setup');
  const response = await fetch(url, {
    ...init,
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(needsCsrf && adminCsrfToken ? { 'X-CSRF-Token': adminCsrfToken } : {}), ...(init?.headers ?? {}) }
  });
  let body: T | ApiError;
  try { body = await response.json() as T | ApiError; } catch { body = { error: 'Resposta inválida do servidor.' } as ApiError; }
  if (!response.ok) {
    const errorBody = body as ApiError;
    if (response.status === 401 && !url.startsWith('/api/public/') && !url.startsWith('/api/auth/')) { location.href = '/login'; }
    const error = new Error(errorBody.error || 'Erro na requisição.') as Error & { status?: number; fieldErrors?: Record<string, string> };
    error.status = response.status;
    if (errorBody.fieldErrors) error.fieldErrors = errorBody.fieldErrors;
    throw error;
  }
  return body as T;
}

async function loadAdminSession(): Promise<boolean> {
  try {
    const state = await api<AuthSessionPayload>('/api/auth/status');
    if (!state.authenticated) { location.href = state.needsSetup ? '/setup-admin' : '/login'; return false; }
    adminCsrfToken = state.csrfToken ?? '';
    adminUserName = state.user?.name ?? 'Equipe MN';
    return true;
  } catch { location.href = '/login'; return false; }
}

async function downloadXlsx(url: string, payload: unknown): Promise<void> {
  const response = await fetch(url, {
    method: 'POST', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': adminCsrfToken },
    body: JSON.stringify(payload ?? {})
  });
  if (response.status === 401) { location.href = '/login'; return; }
  if (!response.ok) {
    let message = 'Não foi possível gerar a planilha.';
    try { const body = await response.json() as ApiError; message = body.error || message; } catch {}
    throw new Error(message);
  }
  const disposition = response.headers.get('content-disposition') ?? '';
  const match = disposition.match(/filename="?([^";]+)"?/i);
  const filename = match?.[1] ?? 'MN_Insights_Exportacao.xlsx';
  const blob = await response.blob();
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement('a'); anchor.href = href; anchor.download = filename; document.body.appendChild(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(href);
}

function currentTheme(): Theme {
  const stored = localStorage.getItem('mn-insights-theme');
  if (stored === 'light' || stored === 'dark') return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  localStorage.setItem('mn-insights-theme', theme);
  document.querySelectorAll<HTMLElement>('[data-theme-icon]').forEach((el) => { el.innerHTML = theme === 'dark' ? icon('sun', 18) : icon('moon', 18); });
  document.querySelectorAll<HTMLElement>('[data-theme-label]').forEach((el) => { el.textContent = theme === 'dark' ? 'Modo claro' : 'Modo escuro'; });
}

function themeToggleMarkup(compact = false): string {
  const theme = currentTheme();
  return `<button class="theme-toggle ${compact ? 'compact' : ''}" type="button" data-theme-toggle aria-label="Alternar tema"><span data-theme-icon>${theme === 'dark' ? icon('sun', 18) : icon('moon', 18)}</span>${compact ? '' : '<span data-theme-label>Modo ' + (theme === 'dark' ? 'claro' : 'escuro') + '</span>'}</button>`;
}

function notificationEventIcon(item: NotificationSummary): string {
  if (item.type === 'REPORT_RESPONDED') return icon('rocket', 18);
  if (item.type === 'REPORT_LATE') return icon('running', 18);
  return icon('clock', 18);
}

function notificationTime(iso: string): string {
  const delta = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(delta) || delta < 0) return dateTime(iso);
  const minutes = Math.floor(delta / 60_000);
  if (minutes < 1) return 'agora';
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  const days = Math.floor(hours / 24);
  return `há ${days} ${days === 1 ? 'dia' : 'dias'}`;
}

function notificationPanelMarkup(): string {
  return `<div class="notification-wrap">
    <button class="icon-btn notification-trigger" type="button" id="notifications-button" aria-label="Notificações" aria-expanded="false" aria-controls="notifications-panel">${icon('bell', 19)}<span class="notification-count" id="notification-count" hidden></span></button>
    <section class="notification-panel" id="notifications-panel" aria-label="Notificações" hidden>
      <div class="notification-panel-head"><div><span class="eyebrow">ATUALIZAÇÕES</span><h2>Notificações</h2></div><button class="text-button notification-read-all" type="button" id="notifications-read-all" hidden>Marcar todas como lidas</button></div>
      <div class="notification-list" id="notification-list"><div class="notification-loading">Carregando notificações…</div></div>
    </section>
  </div>`;
}

function renderNotifications(payload: NotificationsPayload): void {
  const count = document.querySelector<HTMLElement>('#notification-count');
  const markAll = document.querySelector<HTMLButtonElement>('#notifications-read-all');
  const list = document.querySelector<HTMLElement>('#notification-list');
  if (count) {
    count.textContent = payload.unreadCount > 99 ? '99+' : String(payload.unreadCount);
    count.hidden = payload.unreadCount === 0;
  }
  if (markAll) markAll.hidden = payload.unreadCount === 0;
  if (!list) return;
  if (!payload.notifications.length) {
    list.innerHTML = `<div class="notification-empty"><span class="notification-empty-icon">${icon('bell', 22)}</span><strong>Nenhuma notificação</strong><span>Quando um relatório exigir atenção, ele aparecerá aqui.</span></div>`;
    return;
  }
  list.innerHTML = payload.notifications.map((item) => `<a class="notification-item ${item.readAt ? '' : 'unread'}" href="/relatorios/${item.reportId}" data-notification-id="${item.id}">
    <span class="notification-event-icon ${item.type === 'REPORT_RESPONDED' ? 'responded' : item.type === 'REPORT_LATE' ? 'late' : 'waiting'}">${notificationEventIcon(item)}</span>
    <span class="notification-copy"><span class="notification-title-row"><strong>${e(item.title)}</strong><small>${e(notificationTime(item.createdAt))}</small></span><span>${e(item.message)}</span><small>${e(item.clientCode)} · ${e(dateTime(item.createdAt))}</small></span>
    ${item.readAt ? '' : '<span class="notification-unread-dot" aria-label="Não lida"></span>'}
  </a>`).join('');

  list.querySelectorAll<HTMLAnchorElement>('[data-notification-id]').forEach((item) => {
    item.addEventListener('click', async (event) => {
      if (!item.classList.contains('unread')) return;
      event.preventDefault();
      const href = item.href;
      try { await api<{ ok: boolean }>(`/api/notifications/${item.dataset.notificationId}/read`, { method: 'POST', body: '{}' }); } catch {}
      location.href = href;
    });
  });
}

async function refreshNotifications(): Promise<void> {
  const list = document.querySelector<HTMLElement>('#notification-list');
  if (!list) return;
  try {
    const payload = await api<NotificationsPayload>('/api/notifications?limit=30');
    renderNotifications(payload);
  } catch {
    list.innerHTML = '<div class="notification-loading">Não foi possível carregar as notificações.</div>';
  }
}

function wireNotifications(): void {
  const trigger = document.querySelector<HTMLButtonElement>('#notifications-button');
  const panel = document.querySelector<HTMLElement>('#notifications-panel');
  const markAll = document.querySelector<HTMLButtonElement>('#notifications-read-all');
  if (!trigger || !panel) return;

  trigger.addEventListener('click', () => {
    const opening = panel.hidden;
    panel.hidden = !opening;
    trigger.setAttribute('aria-expanded', String(opening));
    if (opening) void refreshNotifications();
  });
  trigger.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !panel.hidden) { panel.hidden = true; trigger.setAttribute('aria-expanded', 'false'); trigger.focus(); }
  });
  panel.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { panel.hidden = true; trigger.setAttribute('aria-expanded', 'false'); trigger.focus(); }
  });
  markAll?.addEventListener('click', async () => {
    markAll.disabled = true;
    try { await api<{ updated: number }>('/api/notifications/read-all', { method: 'POST', body: '{}' }); await refreshNotifications(); }
    catch (error) { toast(error instanceof Error ? error.message : 'Não foi possível atualizar as notificações.', 'error'); }
    finally { markAll.disabled = false; }
  });
  if (!document.querySelector('.loading-page')) void refreshNotifications();
}

function wireGlobalControls(): void {
  applyTheme(currentTheme());
  document.querySelectorAll<HTMLButtonElement>('[data-theme-toggle]').forEach((button) => {
    button.addEventListener('click', () => applyTheme(currentTheme() === 'dark' ? 'light' : 'dark'));
  });
  const searchForm = document.querySelector<HTMLFormElement>('#global-search');
  searchForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    const input = searchForm.querySelector<HTMLInputElement>('input');
    const query = input?.value.trim() ?? '';
    location.href = query ? `/clientes?search=${encodeURIComponent(query)}` : '/clientes';
  });
  document.querySelector<HTMLButtonElement>('#logout-button')?.addEventListener('click', async () => {
    try { await api<{ ok: boolean }>('/api/auth/logout', { method: 'POST', body: '{}' }); } catch {}
    adminCsrfToken = '';
    location.href = '/login';
  });
  wireNotifications();
}

function adminShell(content: string, active: AdminSection = 'dashboard'): string {
  return `
    <div class="app-shell">
      <aside class="sidebar" aria-label="Navegação principal">
        <a class="sidebar-brand" href="/dashboard" aria-label="MN Insights">
          <img src="/assets/mn-insights-mark.png" alt="" />
          <span>MN Insights</span>
        </a>
        <div class="nav-label">VISÃO GERAL</div>
        <nav class="side-nav">
          <a class="side-link ${active === 'dashboard' ? 'active' : ''}" href="/dashboard">${icon('dashboard')}<span>Dashboard</span></a>
          <a class="side-link ${active === 'clients' ? 'active' : ''}" href="/clientes">${icon('users')}<span>Clientes</span></a>
          <a class="side-link ${active === 'reports' ? 'active' : ''}" href="/relatorios">${icon('report')}<span>Relatórios</span></a>
          <a class="side-link ${active === 'theses' ? 'active' : ''}" href="/teses">${icon('layers')}<span>Teses</span></a>
        </nav>
        <div class="sidebar-spacer"></div>
        <div class="nav-label">PREFERÊNCIAS</div>
        ${themeToggleMarkup(false)}
        <button class="side-link logout-link" type="button" id="logout-button" aria-label="Sair da área interna">${icon('back')}<span>Sair</span></button>
      </aside>
      <main id="main" class="admin-main">
        <header class="topbar">
          <form class="global-search" id="global-search" role="search">
            ${icon('search', 18)}
            <input type="search" aria-label="Pesquisar cliente" placeholder="Pesquisar cliente por nome ou código..." />
          </form>
          <div class="topbar-actions">
            ${notificationPanelMarkup()}
            ${themeToggleMarkup(true)}
            <div class="topbar-user"><span class="topbar-user-dot">MN</span><div><strong>${e(adminUserName)}</strong><small>acesso interno</small></div></div><div class="topbar-brand-mini"><img src="/assets/mn-insights-mark.png" alt="" /><span>MN Insights</span></div>
          </div>
        </header>
        ${content}
      </main>
    </div>`;
}

function loadingAdmin(active: AdminSection = 'dashboard'): void {
  app.innerHTML = adminShell(`<section class="page loading-page" aria-label="Carregando"><div class="skeleton loading-title"></div><div class="loading-grid">${Array.from({ length: 4 }, () => '<div class="skeleton loading-card"></div>').join('')}</div></section>`, active);
  wireGlobalControls();
}

let chartSequence = 0;

function emptyState(title: string, text: string, action = '', kind = ''): string {
  return `<div class="empty-state ${kind}"><div class="empty-orbit"><div class="empty-icon">${icon('spark', 24)}</div></div><h3>${e(title)}</h3><p>${e(text)}</p>${action ? `<div class="empty-actions">${action}</div>` : ''}</div>`;
}

function responseDonut(reports: ReportSummary[]): string {
  const total = reports.length;
  const responded = reports.filter((report) => report.status === 'RESPONDED').length;
  const pending = Math.max(0, total - responded);
  const percent = total ? Math.min(100, Math.max(0, Math.round((responded / total) * 100))) : 0;
  const gradientId = `response-ring-${++chartSequence}`;
  return `<div class="donut-wrap"><div class="donut" aria-label="${percent}% concluído">
    <svg class="donut-svg" viewBox="0 0 120 120" role="img" aria-hidden="true">
      <defs>
        <linearGradient id="${gradientId}" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop class="donut-stop donut-stop-a" offset="0%"/>
          <stop class="donut-stop donut-stop-b" offset="52%"/>
          <stop class="donut-stop donut-stop-c" offset="100%"/>
        </linearGradient>
      </defs>
      <circle class="donut-track" cx="60" cy="60" r="48" pathLength="100"/>
      <circle class="donut-progress" cx="60" cy="60" r="48" pathLength="100" stroke="url(#${gradientId})" stroke-dasharray="${percent} ${100 - percent}" style="opacity:${percent === 0 ? 0 : 1}"/>
    </svg>
    <div class="donut-center"><strong>${percent}%</strong><span>concluído</span></div>
  </div><div class="donut-copy"><strong>${responded} de ${total}</strong><span>${total ? 'relatórios respondidos' : 'nenhum relatório criado'}</span></div></div><div class="response-progress" aria-label="${percent}% dos relatórios respondidos"><div class="response-progress-head"><span>Progresso</span><strong>${responded} respondido${responded === 1 ? '' : 's'} · ${pending} pendente${pending === 1 ? '' : 's'}</strong></div><div class="response-progress-track"><span style="width:${percent}%"></span></div></div>`;
}

interface AggregatedMetricPoint {
  periodStart: string;
  periodEnd: string;
  thesisName: string;
  investmentCents: number;
  leads: number;
  cplCents: number;
  cpcCents: number;
  contracts: number;
}

function aggregateReportMetrics(reports: ReportSummary[]): AggregatedMetricPoint[] {
  const grouped = new Map<string, { periodStart: string; periodEnd: string; thesisName: string; investmentCents: number; leads: number; cpcTotal: number; cpcCount: number; contracts: number }>();
  for (const report of reports) {
    for (const metric of report.metrics) {
      const key = `${report.periodStart}::${metric.thesisName}`;
      const existing = grouped.get(key) ?? { periodStart: report.periodStart, periodEnd: report.periodEnd, thesisName: metric.thesisName, investmentCents: 0, leads: 0, cpcTotal: 0, cpcCount: 0, contracts: 0 };
      existing.investmentCents += metric.investmentCents;
      existing.leads += metric.leads;
      existing.cpcTotal += metric.cpcCents;
      existing.cpcCount += 1;
      existing.contracts += report.feedbacks.find((feedback) => feedback.thesisId === metric.thesisId)?.contractCount ?? 0;
      grouped.set(key, existing);
    }
  }
  return Array.from(grouped.values()).map((item) => ({
    periodStart: item.periodStart,
    periodEnd: item.periodEnd,
    thesisName: item.thesisName,
    investmentCents: item.investmentCents,
    leads: item.leads,
    cplCents: item.leads ? Math.round(item.investmentCents / item.leads) : 0,
    cpcCents: item.cpcCount ? Math.round(item.cpcTotal / item.cpcCount) : 0,
    contracts: item.contracts
  })).sort((a, b) => a.periodStart.localeCompare(b.periodStart));
}

function smoothPath(points: Array<{ x: number; y: number }>): string {
  if (!points.length) return '';
  if (points.length === 1) return `M ${points[0]!.x} ${points[0]!.y}`;
  let path = `M ${points[0]!.x} ${points[0]!.y}`;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1]!;
    const current = points[index]!;
    const midX = (previous.x + current.x) / 2;
    path += ` C ${midX} ${previous.y}, ${midX} ${current.y}, ${current.x} ${current.y}`;
  }
  return path;
}

function trendLineChart(reports: ReportSummary[]): string {
  const data = aggregateReportMetrics(reports);
  if (!data.length) return emptyState('Histórico ainda vazio', 'Quando você criar relatórios semanais, a evolução do CPL aparecerá aqui.');
  const chartId = `cpl-chart-${++chartSequence}`;
  const periods = Array.from(new Map(data.map((d) => [d.periodStart, { start: d.periodStart, end: d.periodEnd }])).values());
  const theses = Array.from(new Set(data.map((d) => d.thesisName))).slice(0, 2);
  const values = data.map((d) => d.cplCents / 100);
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = Math.max(max - min, 1);
  const yMin = Math.max(0, min - span * .18);
  const yMax = max + span * .22;
  const chartWidth = 220;
  const chartHeight = 60;
  const xFor = (index: number) => periods.length === 1 ? 120 : 28 + (index / (periods.length - 1)) * 184;
  const yFor = (value: number) => 45 - ((value - yMin) / Math.max(yMax - yMin, 1)) * 34;
  const grid = [0, .5, 1].map((ratio) => {
    const y = 45 - ratio * 34;
    const value = yMin + ratio * (yMax - yMin);
    return `<line class="chart-grid-line" x1="28" x2="212" y1="${y}" y2="${y}"/><text class="chart-axis-label" x="3" y="${y + 1.6}">R$ ${e(new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(value))}</text>`;
  }).join('');
  const series = theses.map((thesis, seriesIndex) => {
    const thesisItems = periods.map((p, index) => {
      const item = data.find((d) => d.thesisName === thesis && d.periodStart === p.start);
      if (!item) return null;
      const previous = data.filter((d) => d.thesisName === thesis && d.periodStart < p.start).at(-1);
      return { item, previous, x: xFor(index), y: yFor(item.cplCents / 100) };
    }).filter((point): point is { item: AggregatedMetricPoint; previous: AggregatedMetricPoint | undefined; x: number; y: number } => Boolean(point));
    if (!thesisItems.length) return '';
    const suffix = seriesIndex === 0 ? 'primary' : 'secondary';
    const path = smoothPath(thesisItems.map((point) => ({ x: point.x, y: point.y })));
    const first = thesisItems[0]!;
    const last = thesisItems[thesisItems.length - 1]!;
    const areaPath = `${path} L ${last.x} 47 L ${first.x} 47 Z`;
    return `<path class="chart-area-${suffix}" d="${areaPath}"/><path class="chart-line-${suffix}" d="${path}"/>${thesisItems.map((point) => {
      const tooltip = JSON.stringify({
        title: point.item.thesisName,
        period: `${shortDate(point.item.periodStart)} — ${fullDate(point.item.periodEnd)}`,
        rows: [
          ['CPL', money(point.item.cplCents)],
          ['CPL anterior', point.previous ? money(point.previous.cplCents) : 'Sem período anterior'],
          ['Variação', point.previous && point.previous.cplCents ? `${point.item.cplCents >= point.previous.cplCents ? '+' : ''}${Math.round((point.item.cplCents - point.previous.cplCents) / point.previous.cplCents * 100)}%` : '—'],
          ['Leads', point.previous ? `${point.item.leads} · ant. ${point.previous.leads}` : String(point.item.leads)],
          ['Investimento', point.previous ? `${money(point.item.investmentCents)} · ant. ${money(point.previous.investmentCents)}` : money(point.item.investmentCents)],
          ['CPC informado', point.previous ? `${money(point.item.cpcCents)} · ant. ${money(point.previous.cpcCents)}` : money(point.item.cpcCents)],
          ['Contratos', point.previous ? `${point.item.contracts} · ant. ${point.previous.contracts}` : String(point.item.contracts)]
        ]
      });
      return `<circle class="chart-dot-${suffix} chart-point" cx="${point.x}" cy="${point.y}" r="2.7" tabindex="0" role="button" aria-label="${e(point.item.thesisName)}: CPL ${e(money(point.item.cplCents))}" data-chart-point data-chart-id="${chartId}" data-x="${point.x / chartWidth * 100}" data-y="${point.y / chartHeight * 100}" data-tooltip="${e(tooltip)}"/>`;
    }).join('')}`;
  }).join('');
  const labels = periods.map((p, index) => `<text class="chart-axis-label chart-x-label" x="${xFor(index)}" y="56" text-anchor="middle">${e(shortDate(p.start))}</text>`).join('');
  return `<div class="chart-shell" id="${chartId}"><div class="chart-wrap trend-chart"><svg viewBox="0 0 ${chartWidth} ${chartHeight}" role="img" aria-label="Evolução semanal do CPL por tese">${grid}${series}${labels}</svg></div><div class="chart-tooltip" id="tooltip-${chartId}" role="status"></div></div><div class="chart-legend">${theses.map((thesis, index) => `<span class="legend-item"><span class="legend-dot ${index ? 'secondary' : ''}"></span>${e(thesis)}</span>`).join('')}</div>`;
}

function contractsChart(reports: ReportSummary[]): string {
  const data = aggregateReportMetrics(reports);
  const contractsData = data.filter((item) => item.contracts > 0);
  if (!contractsData.length) return emptyState('Sem contratos informados', 'Quando contratos forem registrados nos feedbacks, a evolução por tese aparecerá aqui.');
  const chartId = `contracts-chart-${++chartSequence}`;
  const periods = Array.from(new Set(data.map((item) => item.periodStart)));
  const theses = Array.from(new Set(data.map((item) => item.thesisName))).slice(0, 2);
  const max = Math.max(...data.map((item) => item.contracts), 1);
  const chartWidth = 200;
  const chartHeight = 64;
  const groupWidth = periods.length === 1 ? 32 : Math.min(30, 126 / periods.length);
  const xFor = (index: number) => periods.length === 1 ? 102 : 26 + (index / (periods.length - 1)) * 164;
  const bars = periods.flatMap((periodStart, periodIndex) => theses.map((thesis, thesisIndex) => {
    const item = data.find((row) => row.periodStart === periodStart && row.thesisName === thesis);
    if (!item) return '';
    const width = theses.length === 1 ? groupWidth * .55 : groupWidth * .38;
    const offset = theses.length === 1 ? 0 : (thesisIndex === 0 ? -width * .62 : width * .62);
    const height = (item.contracts / max) * 38;
    const x = xFor(periodIndex) + offset - width / 2;
    const y = 49 - height;
    const tooltip = JSON.stringify({ title: thesis, period: `${shortDate(item.periodStart)} — ${fullDate(item.periodEnd)}`, rows: [['Contratos', String(item.contracts)], ['Leads', String(item.leads)], ['CPL', money(item.cplCents)], ['Investimento', money(item.investmentCents)]] });
    return `<rect class="contract-bar ${thesisIndex ? 'secondary' : ''} chart-point" x="${x}" y="${y}" width="${width}" height="${Math.max(height, item.contracts ? 2.2 : 0)}" rx="${Math.min(3, width / 2)}" tabindex="0" role="button" aria-label="${e(thesis)}: ${item.contracts} contratos" data-chart-point data-chart-id="${chartId}" data-x="${xFor(periodIndex) / chartWidth * 100}" data-y="${Math.max(10, y) / chartHeight * 100}" data-tooltip="${e(tooltip)}"/>`;
  })).join('');
  const labels = periods.map((start, index) => `<text class="chart-axis-label chart-x-label" x="${xFor(index)}" y="59" text-anchor="middle">${e(shortDate(start))}</text>`).join('');
  const totals = theses.map((thesis) => ({ thesis, count: data.filter((item) => item.thesisName === thesis).reduce((sum, item) => sum + item.contracts, 0) }));
  return `<div class="contract-chart-summary">${totals.map((item, index) => `<div><span><i class="legend-dot ${index ? 'secondary' : ''}"></i>${e(item.thesis)}</span><strong>${item.count}</strong></div>`).join('')}</div><div class="chart-shell" id="${chartId}"><div class="chart-wrap contract-chart-canvas"><svg viewBox="0 0 ${chartWidth} ${chartHeight}" role="img" aria-label="Contratos fechados por tese e período"><line class="chart-grid-line" x1="22" x2="194" y1="49" y2="49"/>${bars}${labels}</svg></div><div class="chart-tooltip" id="tooltip-${chartId}" role="status"></div></div>`;
}

function contractBreakdown(reports: ReportSummary[]): string {
  const map = new Map<string, number>();
  for (const report of reports) for (const feedback of report.feedbacks) map.set(feedback.thesisName, (map.get(feedback.thesisName) ?? 0) + (feedback.contractCount ?? 0));
  const items = Array.from(map.entries()).filter(([, count]) => count > 0);
  if (!items.length) return '<small class="metric-context">Ainda sem contratos por tese</small>';
  return `<small class="metric-context">${items.map(([name, count]) => `${count} ${e(name)}`).join(' · ')}</small>`;
}

function wireChartTooltips(): void {
  document.querySelectorAll<SVGElement>('[data-chart-point]').forEach((point) => {
    const show = () => {
      const chartId = point.dataset.chartId;
      if (!chartId) return;
      const tooltip = document.querySelector<HTMLElement>(`#tooltip-${chartId}`);
      if (!tooltip) return;
      try {
        const payload = JSON.parse(point.dataset.tooltip ?? '{}') as { title?: string; period?: string; rows?: Array<[string, string]> };
        tooltip.innerHTML = `<div class="tooltip-title">${e(payload.title ?? '')}</div><div class="tooltip-period">${e(payload.period ?? '')}</div><div class="tooltip-grid">${(payload.rows ?? []).map(([label, value]) => `<span>${e(label)}</span><strong>${e(value)}</strong>`).join('')}</div>`;
        const xPercent = Number(point.dataset.x ?? 50);
        tooltip.style.left = `${xPercent}%`;
        tooltip.style.top = `${Number(point.dataset.y ?? 30)}%`;
        tooltip.classList.toggle('align-left', xPercent < 20);
        tooltip.classList.toggle('align-right', xPercent > 80);
        tooltip.classList.add('visible');
      } catch { /* atributo inválido: não interrompe o gráfico */ }
    };
    const hide = () => { const chartId = point.dataset.chartId; if (chartId) document.querySelector<HTMLElement>(`#tooltip-${chartId}`)?.classList.remove('visible'); };
    point.addEventListener('mouseenter', show);
    point.addEventListener('focus', show);
    point.addEventListener('mouseleave', hide);
    point.addEventListener('blur', hide);
  });
}

function qualityChart(data: DashboardPayload): string {
  const rows = data.qualityDistribution.filter((item) => item.count > 0);
  if (!rows.length) return emptyState('Sem avaliações ainda', 'As avaliações de qualidade dos leads aparecerão aqui após os primeiros feedbacks.');
  const max = Math.max(...rows.map((item) => item.count), 1);
  return `<div class="quality-bars">${rows.map((item) => `<div class="quality-bar-row"><div class="quality-bar-head"><span>${e(qualityLabel[item.quality])}</span><strong>${item.count}</strong></div><div class="quality-track"><span style="width:${Math.max(8, (item.count / max) * 100)}%"></span></div></div>`).join('')}</div>`;
}

function problemsInsights(data: DashboardPayload): string {
  if (!data.problemDistribution.length) return emptyState('Nenhum padrão registrado', 'Problemas recorrentes serão agrupados aqui quando houver respostas.');
  const max = Math.max(...data.problemDistribution.map((item) => item.count), 1);
  return `<div class="problem-list">${data.problemDistribution.slice(0, 6).map((item) => `<div class="problem-row"><div class="problem-meta"><span>${e(problemLabel[item.problem])}</span><strong>${item.count}</strong></div><div class="problem-track"><span style="width:${Math.max(8, item.count / max * 100)}%"></span></div></div>`).join('')}</div>`;
}

function reportRows(reports: ReportSummary[], showClient = true): string {
  if (!reports.length) return `<tr class="empty-table-row"><td colspan="${showClient ? 7 : 6}">${emptyState('Nenhum relatório por aqui', 'Crie um relatório semanal para começar a estruturar o histórico.')}</td></tr>`;
  return reports.map((report) => `
    <tr>
      ${showClient ? `<td><a class="client-link table-client-link" href="/clientes/${e(report.clientCode)}"><span class="table-name">${e(report.clientName)}</span><span class="table-code">${e(report.clientCode)}</span></a></td>` : ''}
      <td>${e(period(report))}</td>
      <td>${thesisPills(report)}</td>
      <td>${statusBadge(report)}</td>
      <td>${report.feedbacks.reduce((sum, f) => sum + (f.contractCount ?? 0), 0) || '—'}</td>
      <td>${(() => { const negotiating = report.feedbacks.filter((f) => f.contractStatus === 'NEGOTIATING'); const count = negotiating.reduce((sum, f) => sum + (f.negotiationCount ?? 0), 0); return negotiating.length ? `<span class="badge badge-neutral">Em negociação${count > 0 ? ` • ${count}` : ''}</span>` : '—'; })()}</td>
      <td><div class="table-actions">
        ${report.status === 'AWAITING_FEEDBACK' ? `<button class="icon-btn copy-report-link" data-token="${e(report.token)}" aria-label="Copiar link público">${icon('copy', 17)}</button><a class="icon-btn" href="/r/${e(report.token)}" target="_blank" rel="noopener" aria-label="Abrir relatório público">${icon('external', 17)}</a>` : ''}
        <a class="icon-btn" href="/relatorios/${report.id}" aria-label="Ver relatório">${icon('report', 17)}</a>
      </div></td>
    </tr>`).join('');
}

function wireCopyButtons(): void {
  document.querySelectorAll<HTMLButtonElement>('.copy-report-link').forEach((button) => {
    button.addEventListener('click', async () => {
      const token = button.dataset.token;
      if (!token) return;
      try {
        await navigator.clipboard.writeText(`${location.origin}/r/${token}`);
        toast('Link do relatório copiado.', 'success');
      } catch {
        toast('Não foi possível copiar automaticamente.', 'error');
      }
    });
  });
}

function setupSteps(hasClients: boolean, hasReports: boolean): string {
  return `<div class="setup-steps">
    <div class="setup-step ${hasClients ? 'done' : 'current'}"><span>${hasClients ? icon('check', 16) : '1'}</span><div><strong>Cadastre um cliente</strong><p>Defina o cliente e as teses que serão acompanhadas.</p></div></div>
    <div class="setup-step ${hasReports ? 'done' : hasClients ? 'current' : ''}"><span>${hasReports ? icon('check', 16) : '2'}</span><div><strong>Crie o relatório semanal</strong><p>Informe investimento, leads e CPC de cada tese.</p></div></div>
    <div class="setup-step"><span>3</span><div><strong>Envie o link</strong><p>O cliente responde e o histórico é atualizado automaticamente.</p></div></div>
  </div>`;
}

async function renderDashboard(): Promise<void> {
  loadingAdmin('dashboard');
  const query = new URLSearchParams(location.search);
  const params = new URLSearchParams();
  for (const key of ['client', 'thesis', 'status']) {
    const value = query.get(key);
    if (value) params.set(key, value);
  }
  try {
    const data = await api<DashboardPayload>(`/api/dashboard?${params.toString()}`);
    const context = brasiliaContext();
    const hasClients = data.clients.length > 0;
    const hasReports = data.reports.length > 0;
    const latestLabel = data.latestPeriod ? `${shortDate(data.latestPeriod.start)} — ${fullDate(data.latestPeriod.end)}` : 'Sem período ativo';
    const responseRate = data.kpis.responseRate;
    const primaryAction = !hasClients
      ? `<a class="hero-button" href="/clientes/novo">Cadastrar primeiro cliente ${icon('arrow', 17)}</a>`
      : `<a class="hero-button" href="/relatorios/novo">Criar relatório semanal ${icon('arrow', 17)}</a>`;

    const content = `<section class="page dashboard-page">
      <div class="dashboard-hero-grid">
        <article class="dashboard-hero">
          <div class="hero-copy">
            <span class="hero-kicker">${e(context.greeting)}, MN MARKETING</span>
            <h1>MN INSIGHTS</h1>
            <p>Transforme o que acontece depois do lead em informação organizada para decisões melhores.</p>
            ${primaryAction}
          </div>
          <div class="hero-visual" aria-hidden="true">
            <div class="rocket-orbit orbit-one"></div><div class="rocket-orbit orbit-two"></div>
            <div class="hero-rocket"><img src="/assets/rocket-brand.png" alt="" /></div>
          </div>
        </article>
        <aside class="today-card card">
          <div class="today-top"><span class="eyebrow">HOJE</span><span class="today-date">${e(context.date)}</span></div>
          <div class="today-rocket"><img src="/assets/rocket-brand.png" alt="" /></div>
          <h2>${e(context.greeting)}, MN MARKETING</h2>
          <p>Seu painel acompanha mídia, feedback e resultado comercial no mesmo fluxo.</p>
          <div class="today-divider"></div>
          <div class="today-stats"><div><strong>${data.kpis.awaitingReports}</strong><span>Pendentes</span></div><div><strong>${data.kpis.respondedReports}</strong><span>Respondidos</span></div><div><strong>${responseRate}%</strong><span>Resposta</span></div></div>
        </aside>
      </div>

      <div class="kpi-strip">
        <article class="metric-tile"><div class="metric-tile-icon">${icon('users')}</div><div><span>Clientes ativos</span><strong>${data.kpis.activeClients}</strong></div></article>
        <article class="metric-tile"><div class="metric-tile-icon">${icon('clock')}</div><div><span>Aguardando feedback</span><strong>${data.kpis.awaitingReports}</strong></div></article>
        <article class="metric-tile"><div class="metric-tile-icon">${icon('check')}</div><div><span>Respondidos</span><strong>${data.kpis.respondedReports}</strong></div></article>
        <article class="metric-tile contracts-kpi"><div class="metric-tile-icon">${icon('money')}</div><div><span>Contratos informados</span><strong>${data.kpis.contractsReported}</strong>${contractBreakdown(data.reports)}</div></article>
      </div>

      ${!hasReports ? `<section class="card onboarding-card"><div><span class="eyebrow">COMECE POR AQUI</span><h2>Seu MN Insights está pronto para receber dados reais.</h2><p>O sistema inicia com a base real de clientes da agência e sem relatórios ou métricas fictícias. Monte seus relatórios na ordem abaixo.</p></div>${setupSteps(hasClients, hasReports)}</section>` : ''}

      ${hasReports ? `<form id="dashboard-filters" class="filter-toolbar" aria-label="Filtros do dashboard">
        <div class="filter-title">${icon('filter', 17)} <span>Filtrar análise</span></div>
        <select class="select compact" id="client-filter" name="client" aria-label="Cliente"><option value="">Todos os clientes</option>${data.clients.map((c) => `<option value="${e(c.code)}" ${data.filters.clientCode === c.code ? 'selected' : ''}>${e(c.code)} — ${e(c.name)}</option>`).join('')}</select>
        <select class="select compact" id="thesis-filter" name="thesis" aria-label="Tese"><option value="">Todas as teses</option>${data.theses.map((t) => `<option value="${e(t.slug)}" ${data.filters.thesisSlug === t.slug ? 'selected' : ''}>${e(t.name)}</option>`).join('')}</select>
        <select class="select compact" id="status-filter" name="status" aria-label="Status"><option value="">Todos os status</option><option value="AWAITING_FEEDBACK" ${data.filters.status === 'AWAITING_FEEDBACK' ? 'selected' : ''}>Aguardando feedback</option><option value="RESPONDED" ${data.filters.status === 'RESPONDED' ? 'selected' : ''}>Respondido</option></select>
        <button class="text-button" type="button" id="clear-filters">Limpar</button>
      </form>` : ''}

      <div class="analytics-grid">
        <article class="card chart-card chart-primary">
          <div class="card-title-row"><div><span class="eyebrow">MÍDIA</span><h2>Evolução do CPL</h2><p>Comparação semanal por tese.</p></div><span class="card-icon">${icon('trend', 20)}</span></div>
          ${trendLineChart(data.reports)}
        </article>
        <article class="card side-analytics-card">
          <div class="card-title-row"><div><span class="eyebrow">FEEDBACK</span><h2>Resposta dos relatórios</h2><p>${data.kpis.reportsTotal ? 'Visão do histórico filtrado' : e(latestLabel)}</p></div></div>
          ${responseDonut(data.reports)}
          <div class="mini-divider"></div>
          <div class="micro-stat"><span>Negociações abertas</span><strong>${data.kpis.negotiatingSignals}</strong></div>
        </article>
      </div>

      <div class="analytics-grid lower-grid">
        <article class="card chart-card"><div class="card-title-row"><div><span class="eyebrow">QUALIDADE</span><h2>Percepção dos leads</h2><p>Frequência das avaliações registradas.</p></div><span class="card-icon">${icon('target', 20)}</span></div>${qualityChart(data)}</article>
        <article class="card chart-card"><div class="card-title-row"><div><span class="eyebrow">DIAGNÓSTICO</span><h2>Problemas recorrentes</h2><p>O que mais apareceu nas respostas.</p></div><span class="card-icon">${icon('alert', 20)}</span></div>${problemsInsights(data)}</article>
      </div>

      <article class="card table-card dashboard-reports">
        <div class="table-head"><div><span class="eyebrow">OPERAÇÃO</span><h2>Relatórios recentes</h2><p>Ações rápidas para acompanhar e compartilhar os links.</p></div><a class="btn btn-secondary" href="/relatorios">Central de relatórios ${icon('arrow', 16)}</a></div>
        <div class="table-scroll"><table><thead><tr><th>Cliente</th><th>Período</th><th>Tese</th><th>Status</th><th>Contratos</th><th>Negociação</th><th aria-label="Ações"></th></tr></thead><tbody>${reportRows(data.reports.slice(0, 6))}</tbody></table></div>
      </article>
    </section>`;
    app.innerHTML = adminShell(content, 'dashboard');
    wireGlobalControls();
    wireCopyButtons();
    wireChartTooltips();

    const form = document.querySelector<HTMLFormElement>('#dashboard-filters');
    form?.addEventListener('change', () => form.requestSubmit());
    form?.addEventListener('submit', (event) => {
      event.preventDefault();
      const fd = new FormData(form);
      const next = new URLSearchParams();
      for (const key of ['client', 'thesis', 'status']) {
        const value = String(fd.get(key) ?? '');
        if (value) next.set(key, value);
      }
      history.replaceState({}, '', `/dashboard${next.size ? `?${next}` : ''}`);
      void renderDashboard();
    });
    document.querySelector('#clear-filters')?.addEventListener('click', () => {
      history.replaceState({}, '', '/dashboard');
      void renderDashboard();
    });
  } catch (error) {
    renderError(error, true, 'dashboard');
  }
}

async function renderClients(): Promise<void> {
  loadingAdmin('clients');
  try {
    const data = await api<{ clients: ClientSummary[] }>('/api/clients');
    const query = new URLSearchParams(location.search).get('search')?.trim().toLocaleLowerCase('pt-BR') ?? '';
    const clients = query ? data.clients.filter((client) => `${client.code} ${client.name}`.toLocaleLowerCase('pt-BR').includes(query)) : data.clients;
    const cards = clients.map((client) => `<article class="client-card card">
      <div class="client-card-top">${clientAvatar(client.code)}<a class="client-card-heading client-link" href="/clientes/${e(client.code)}"><span>${e(client.code)}</span><h2>${e(client.name)}</h2></a><a class="round-arrow" href="/clientes/${e(client.code)}" aria-label="Abrir ${e(client.name)}">${icon('arrow', 17)}</a></div>
      <div class="client-theses">${client.theses.map((thesis) => `<span class="thesis-pill">${e(thesis.name)}</span>`).join('')}</div>
      <div class="client-card-footer"><div><span>Último relatório</span><strong>${client.latestReport ? e(period(client.latestReport)) : 'Ainda não criado'}</strong></div><div>${client.latestReport ? statusBadge(client.latestReport) : '<span class="badge badge-neutral">Sem relatório</span>'}</div></div>
    </article>`).join('');
    const state = !data.clients.length
      ? emptyState('Sua carteira está vazia', 'Cadastre o primeiro cliente para criar um ambiente individual e começar a gerar relatórios.', `<a class="btn btn-primary" href="/clientes/novo">${icon('plus', 17)} Cadastrar cliente</a>`, 'large')
      : !clients.length
        ? emptyState('Nenhum cliente encontrado', `Não encontramos resultados para “${query}”.`, '<a class="btn btn-secondary" href="/clientes">Limpar busca</a>')
        : `<div class="client-grid">${cards}</div>`;
    app.innerHTML = adminShell(`<section class="page">
      <header class="page-heading"><div><span class="eyebrow">CARTEIRA</span><h1>Clientes</h1><p>Cada cliente possui seu próprio painel, teses, relatórios e histórico.</p></div><a class="btn btn-primary" href="/clientes/novo">${icon('plus', 17)} Novo cliente</a></header>
      ${query ? `<div class="search-result-note">Resultados para <strong>${e(query)}</strong> <a href="/clientes">limpar</a></div>` : ''}
      ${state}
    </section>`, 'clients');
    wireGlobalControls();
  } catch (error) {
    renderError(error, true, 'clients');
  }
}

async function renderNewClient(): Promise<void> {
  loadingAdmin('clients');
  try {
    const dashboard = await api<DashboardPayload>('/api/dashboard');
    app.innerHTML = adminShell(`<section class="page form-page">
      <header class="page-heading"><div><a class="back-link" href="/clientes">${icon('back', 16)} Voltar aos clientes</a><span class="eyebrow">NOVO CLIENTE</span><h1>Crie um ambiente individual</h1><p>O código MN é gerado automaticamente e o cliente pode acompanhar até duas teses.</p></div></header>
      <form id="new-client-form" class="card form-card premium-form">
        <div class="form-section-head"><span class="form-section-icon">${icon('users', 20)}</span><div><h2>Informações do cliente</h2><p>Comece com os dados essenciais. Você poderá criar relatórios depois.</p></div></div>
        <div class="form-grid"><div class="field"><label for="client-name">Nome do cliente</label><input class="input" id="client-name" name="name" autocomplete="off" maxlength="100" required placeholder="Nome completo ou nome do escritório"/><div class="field-error" id="error-name"></div></div>
        <div class="field"><label>Teses ativas <span class="field-hint">Selecione 1 ou 2</span></label><div class="checkbox-stack">${dashboard.theses.map((thesis) => `<label class="simple-check"><input type="checkbox" name="thesis" value="${e(thesis.slug)}"/><span class="check-visual">${icon('check', 13)}</span><span>${e(thesis.name)}</span></label>`).join('')}</div><div class="field-error" id="error-thesisSlugs"></div></div></div>
        <div class="report-actions"><a class="btn btn-secondary" href="/clientes">Cancelar</a><button class="btn btn-primary" type="submit">Criar cliente ${icon('arrow', 17)}</button></div>
      </form>
    </section>`, 'clients');
    wireGlobalControls();
    const form = document.querySelector<HTMLFormElement>('#new-client-form');
    form?.addEventListener('submit', async (event) => {
      event.preventDefault();
      document.querySelectorAll('.field-error').forEach((el) => { el.textContent = ''; });
      const fd = new FormData(form);
      const payload = { name: String(fd.get('name') ?? ''), thesisSlugs: fd.getAll('thesis').map(String) as ThesisSlug[] };
      const button = form.querySelector<HTMLButtonElement>('button[type="submit"]');
      if (button) button.disabled = true;
      try {
        const result = await api<{ client: ClientSummary }>('/api/clients', { method: 'POST', body: JSON.stringify(payload) });
        location.href = `/clientes/${result.client.code}`;
      } catch (error) {
        const typed = error as Error & { fieldErrors?: Record<string, string> };
        for (const [field, message] of Object.entries(typed.fieldErrors ?? {})) {
          const el = document.querySelector<HTMLElement>(`#error-${field}`);
          if (el) el.textContent = message;
        }
        toast(typed.message, 'error');
        if (button) button.disabled = false;
      }
    });
  } catch (error) {
    renderError(error, true, 'clients');
  }
}

interface ThesisAnalytics {
  slug: ThesisSlug;
  name: string;
  reports: number;
  leads: number;
  investmentCents: number;
  contracts: number;
  cplCents: number;
  costPerContractCents: number | null;
  conversionPercent: number | null;
  latestCplCents: number | null;
  previousCplCents: number | null;
}

function thesisAnalytics(reports: ReportSummary[]): ThesisAnalytics[] {
  const map = new Map<ThesisSlug, { slug: ThesisSlug; name: string; reports: Set<number>; leads: number; investmentCents: number; feedbackLeads: number; feedbackInvestmentCents: number; contracts: number; cpls: Array<{ period: string; cents: number }> }>();
  for (const report of reports) {
    for (const metric of report.metrics) {
      const item = map.get(metric.thesisSlug) ?? { slug: metric.thesisSlug, name: metric.thesisName, reports: new Set<number>(), leads: 0, investmentCents: 0, feedbackLeads: 0, feedbackInvestmentCents: 0, contracts: 0, cpls: [] };
      item.reports.add(report.id);
      item.leads += metric.leads;
      item.investmentCents += metric.investmentCents;
      const feedback = report.feedbacks.find((candidate) => candidate.thesisId === metric.thesisId);
      if (feedback) {
        item.feedbackLeads += metric.leads;
        item.feedbackInvestmentCents += metric.investmentCents;
        item.contracts += feedback.contractCount ?? 0;
      }
      item.cpls.push({ period: report.periodStart, cents: metric.cplCents });
      map.set(metric.thesisSlug, item);
    }
  }
  return Array.from(map.values()).map((item) => {
    item.cpls.sort((a, b) => a.period.localeCompare(b.period));
    const latest = item.cpls.at(-1)?.cents ?? null;
    const previous = item.cpls.at(-2)?.cents ?? null;
    return {
      slug: item.slug,
      name: item.name,
      reports: item.reports.size,
      leads: item.leads,
      investmentCents: item.investmentCents,
      contracts: item.contracts,
      cplCents: item.leads ? Math.round(item.investmentCents / item.leads) : 0,
      costPerContractCents: item.contracts ? Math.round(item.feedbackInvestmentCents / item.contracts) : null,
      conversionPercent: item.feedbackLeads ? Math.round((item.contracts / item.feedbackLeads) * 1000) / 10 : null,
      latestCplCents: latest,
      previousCplCents: previous
    };
  }).sort((a, b) => b.contracts - a.contracts || b.leads - a.leads);
}

function thesisPerformanceCards(reports: ReportSummary[]): string {
  const rows = thesisAnalytics(reports);
  if (!rows.length) return emptyState('Sem dados por tese', 'Crie relatórios para visualizar o desempenho separado de cada tese.');
  return `<div class="thesis-performance-list">${rows.map((item, index) => {
    const trend = item.latestCplCents !== null && item.previousCplCents
      ? Math.round((item.latestCplCents - item.previousCplCents) / item.previousCplCents * 100)
      : null;
    return `<article class="thesis-performance-card"><div class="thesis-performance-head"><div><span class="thesis-rank">${String(index + 1).padStart(2, '0')}</span><h3>${e(item.name)}</h3></div>${item.contracts > 0 && index === 0 ? '<span class="performance-badge">Maior volume de contratos</span>' : ''}</div><div class="thesis-stat-grid"><div><span>Leads</span><strong>${item.leads}</strong></div><div><span>Contratos</span><strong>${item.contracts}</strong></div><div><span>CPL médio</span><strong>${money(item.cplCents)}</strong></div><div><span>Custo/contrato</span><strong>${item.costPerContractCents === null ? '—' : money(item.costPerContractCents)}</strong></div><div><span>Investimento</span><strong>${money(item.investmentCents)}</strong></div><div><span>Conversão informada</span><strong>${item.conversionPercent === null ? '—' : `${item.conversionPercent}%`}</strong></div></div><div class="thesis-card-foot"><span>${item.reports} período${item.reports === 1 ? '' : 's'} analisado${item.reports === 1 ? '' : 's'}</span><span class="trend-chip ${trend !== null && trend <= 0 ? 'positive' : trend !== null ? 'negative' : ''}">${trend === null ? 'Sem comparação de CPL' : `${trend > 0 ? '+' : ''}${trend}% CPL vs. anterior`}</span></div></article>`;
  }).join('')}</div>`;
}

function clientQualityChart(reports: ReportSummary[]): string {
  const counts = (['POOR', 'REGULAR', 'GOOD', 'VERY_GOOD'] as LeadQuality[]).map((quality) => ({ quality, count: reports.flatMap((report) => report.feedbacks).filter((feedback) => feedback.quality === quality).length }));
  const fakeDashboard = { qualityDistribution: counts } as DashboardPayload;
  return qualityChart(fakeDashboard);
}

async function renderClient(code: string): Promise<void> {
  loadingAdmin('clients');
  try {
    const data = await api<ClientDetailPayload>(`/api/clients/${encodeURIComponent(code)}`);
    const latest = data.reports[0];
    const totalContracts = data.reports.flatMap((report) => report.feedbacks).reduce((sum, feedback) => sum + (feedback.contractCount ?? 0), 0);
    const pending = data.reports.filter((report) => report.status === 'AWAITING_FEEDBACK').length;
    const responded = data.reports.filter((report) => report.status === 'RESPONDED').length;
    const latestMetrics = latest ? latest.metrics : [];
    const metricSummary = latestMetrics.length ? latestMetrics.map((metric) => `<article class="client-metric"><div><span>${e(metric.thesisName)}</span><strong>${metric.leads} leads</strong></div><div class="client-metric-grid"><span>Investimento <b>${money(metric.investmentCents)}</b></span><span>CPL <b>${money(metric.cplCents)}</b></span><span>CPC <b>${money(metric.cpcCents)}</b></span></div></article>`).join('') : emptyState('Sem métricas ainda', 'Crie o primeiro relatório semanal deste cliente para começar o acompanhamento.');
    app.innerHTML = adminShell(`<section class="page client-page">
      <header class="client-profile card">
        <div class="client-profile-main">${clientAvatar(data.client.code, true)}<div><span class="client-code">${e(data.client.code)}</span><h1>${e(data.client.name)}</h1><div class="client-theses">${data.client.theses.map((thesis) => `<span class="thesis-pill">${e(thesis.name)}</span>`).join('')}</div></div></div>
        <div class="client-profile-actions"><button class="btn btn-secondary" type="button" id="export-client">${icon('report', 17)} Exportar histórico</button><a class="btn btn-secondary" href="/teses?client=${e(data.client.code)}">${icon('layers', 17)} Analisar teses</a><a class="btn btn-primary" href="/relatorios/novo?client=${e(data.client.code)}">${icon('plus', 17)} Novo relatório</a></div>
      </header>

      <div class="client-summary-strip">
        <div><span>Relatórios</span><strong>${data.reports.length}</strong></div><div><span>Respondidos</span><strong>${responded}</strong></div><div><span>Pendentes</span><strong>${pending}</strong></div><div><span>Contratos</span><strong>${totalContracts}</strong>${contractBreakdown(data.reports)}</div>
      </div>

      <div class="client-charts-grid">
        <article class="card chart-card compact-card"><div class="card-title-row"><div><span class="eyebrow">MÍDIA</span><h2>Evolução do CPL</h2><p>Trajetória semanal separada por tese.</p></div><span class="card-icon">${icon('trend', 20)}</span></div>${trendLineChart(data.reports)}</article>
        <article class="card chart-card compact-card"><div class="card-title-row"><div><span class="eyebrow">RESULTADO</span><h2>Contratos por tese</h2><p>Volume informado em cada período.</p></div><span class="card-icon">${icon('money', 20)}</span></div>${contractsChart(data.reports)}</article>
      </div>

      <div class="client-content-grid">
        <section class="client-main-column">
          <article class="card table-card"><div class="table-head"><div><span class="eyebrow">ARQUIVO</span><h2>Relatórios do cliente</h2><p>Todos os períodos, feedbacks e links em um só lugar.</p></div><a class="btn btn-secondary" href="/relatorios/novo?client=${e(data.client.code)}">Novo relatório</a></div><div class="table-scroll"><table><thead><tr><th>Período</th><th>Tese</th><th>Status</th><th>Contratos</th><th>Negociação</th><th></th></tr></thead><tbody>${reportRows(data.reports, false)}</tbody></table></div></article>
        </section>
        <aside class="client-side-column">
          <article class="card side-panel"><div class="card-title-row"><div><span class="eyebrow">ÚLTIMA SEMANA</span><h2>Métricas recentes</h2><p>${latest ? e(period(latest)) : 'Nenhum período registrado'}</p></div></div><div class="client-metrics-stack">${metricSummary}</div></article>
          <article class="card side-panel"><div class="card-title-row"><div><span class="eyebrow">PERCEPÇÃO</span><h2>Qualidade dos leads</h2></div></div>${clientQualityChart(data.reports)}</article>
        </aside>
      </div>
    </section>`, 'clients');
    wireGlobalControls();
    wireCopyButtons();
    wireChartTooltips();
    document.querySelector<HTMLButtonElement>('#export-client')?.addEventListener('click', async (event) => {
      const button = event.currentTarget as HTMLButtonElement; button.disabled = true;
      try { await downloadXlsx('/api/exports/general', { clientCode: data.client.code }); toast('Histórico do cliente exportado.', 'success'); }
      catch (error) { toast(error instanceof Error ? error.message : 'Não foi possível exportar.', 'error'); }
      finally { button.disabled = false; }
    });
  } catch (error) {
    renderError(error, true, 'clients');
  }
}

function reportsComparison(reports: ReportSummary[]): string {
  const responded = reports.filter((report) => report.status === 'RESPONDED');
  if (responded.length < 2) return emptyState('Comparação disponível após dois períodos', 'Com pelo menos dois relatórios respondidos, esta área mostrará a mudança entre as semanas.');
  const current = responded[0]!;
  const previous = responded[1]!;
  const sum = (report: ReportSummary, key: 'leads' | 'investmentCents') => report.metrics.reduce((acc, metric) => acc + metric[key], 0);
  const currentLeads = sum(current, 'leads');
  const previousLeads = sum(previous, 'leads');
  const currentInvestment = sum(current, 'investmentCents');
  const previousInvestment = sum(previous, 'investmentCents');
  const currentContracts = current.feedbacks.reduce((acc, f) => acc + (f.contractCount ?? 0), 0);
  const previousContracts = previous.feedbacks.reduce((acc, f) => acc + (f.contractCount ?? 0), 0);
  const delta = (a: number, b: number) => b === 0 ? '—' : `${a >= b ? '+' : ''}${Math.round((a - b) / b * 100)}%`;
  return `<div class="comparison-grid"><div><span>Leads</span><strong>${currentLeads}</strong><small>${delta(currentLeads, previousLeads)} vs. anterior</small></div><div><span>Investimento</span><strong>${money(currentInvestment)}</strong><small>${delta(currentInvestment, previousInvestment)} vs. anterior</small></div><div><span>Contratos</span><strong>${currentContracts}</strong><small>${delta(currentContracts, previousContracts)} vs. anterior</small></div></div><div class="comparison-periods"><span>${e(period(previous))}</span>${icon('arrow', 14)}<span>${e(period(current))}</span></div>`;
}

function thesisOverviewChart(reports: ReportSummary[]): string {
  const rows = thesisAnalytics(reports);
  if (!rows.length) return emptyState('Ainda não há teses com histórico', 'As comparações aparecerão quando existirem relatórios com métricas.');
  const maxContracts = Math.max(...rows.map((item) => item.contracts), 1);
  const maxLeads = Math.max(...rows.map((item) => item.leads), 1);
  return `<div class="thesis-comparison-chart">${rows.map((item) => {
    const leadWidth = item.leads ? Math.max(4, item.leads / maxLeads * 100) : 0;
    const contractWidth = item.contracts ? Math.max(4, item.contracts / maxContracts * 100) : 0;
    return `<div class="thesis-comparison-row"><div class="thesis-comparison-label"><strong>${e(item.name)}</strong><span>${item.contracts} contratos · ${item.leads} leads</span></div><div class="dual-bars">
      <div class="dual-bar leads" tabindex="0" aria-label="Leads: ${item.leads}">
        <div class="dual-bar-meta"><span>Leads</span><strong>${item.leads}</strong></div>
        <div class="dual-bar-track"><span style="width:${leadWidth}%"></span></div>
        <div class="dual-bar-tooltip"><b>Leads</b><span>${item.leads} contatos gerados nesta tese</span></div>
      </div>
      <div class="dual-bar contracts" tabindex="0" aria-label="Contratos: ${item.contracts}">
        <div class="dual-bar-meta"><span>Contratos</span><strong>${item.contracts}</strong></div>
        <div class="dual-bar-track"><span style="width:${contractWidth}%"></span></div>
        <div class="dual-bar-tooltip"><b>Contratos</b><span>${item.contracts} fechamento${item.contracts === 1 ? '' : 's'} informado${item.contracts === 1 ? '' : 's'}</span></div>
      </div>
    </div></div>`;
  }).join('')}</div>`;
}

async function renderTheses(): Promise<void> {
  loadingAdmin('theses');
  try {
    const query = new URLSearchParams(location.search);
    const params = new URLSearchParams();
    for (const key of ['client', 'thesis']) {
      const value = query.get(key);
      if (value) params.set(key, value);
    }
    const data = await api<DashboardPayload>(`/api/dashboard?${params.toString()}`);
    const analytics = thesisAnalytics(data.reports);
    const totalLeads = analytics.reduce((sum, item) => sum + item.leads, 0);
    const totalContracts = analytics.reduce((sum, item) => sum + item.contracts, 0);
    const totalInvestment = analytics.reduce((sum, item) => sum + item.investmentCents, 0);
    const best = analytics.find((item) => item.contracts > 0) ?? null;
    const selectedClient = data.filters.clientCode ? data.clients.find((client) => client.code === data.filters.clientCode) : null;

    app.innerHTML = adminShell(`<section class="page theses-page">
      <header class="page-heading"><div><span class="eyebrow">TESES</span><h1>Desempenho por tese</h1><p>${selectedClient ? `Análise individual de ${e(selectedClient.code)} — ${e(selectedClient.name)}.` : 'Compare mídia e resultado comercial sem misturar teses diferentes.'}</p></div>${selectedClient ? `<a class="btn btn-secondary" href="/clientes/${e(selectedClient.code)}">Voltar ao cliente</a>` : ''}</header>

      <form id="theses-filters" class="filter-toolbar" aria-label="Filtros de teses"><div class="filter-title">${icon('filter', 17)} <span>Análise</span></div><select class="select compact" name="client" aria-label="Cliente"><option value="">Todos os clientes</option>${data.clients.map((client) => `<option value="${e(client.code)}" ${data.filters.clientCode === client.code ? 'selected' : ''}>${e(client.code)} — ${e(client.name)}</option>`).join('')}</select><select class="select compact" name="thesis" aria-label="Tese"><option value="">Todas as teses</option>${data.theses.map((thesis) => `<option value="${e(thesis.slug)}" ${data.filters.thesisSlug === thesis.slug ? 'selected' : ''}>${e(thesis.name)}</option>`).join('')}</select><button type="button" class="text-button" id="clear-theses-filters">Limpar</button></form>

      <div class="theses-summary-grid"><article class="summary-card"><span>Teses com dados</span><strong>${analytics.length}</strong><small>no filtro atual</small></article><article class="summary-card"><span>Leads</span><strong>${totalLeads}</strong><small>somados por tese</small></article><article class="summary-card"><span>Contratos</span><strong>${totalContracts}</strong><small>informados nos feedbacks</small></article><article class="summary-card accent"><span>Investimento</span><strong>${money(totalInvestment)}</strong><small>${best ? `Maior volume: ${e(best.name)}` : 'sem tese líder ainda'}</small></article></div>

      ${data.reports.length ? `<div class="theses-analytics-grid"><article class="card chart-card compact-card"><div class="card-title-row"><div><span class="eyebrow">COMPARAÇÃO</span><h2>Leads e contratos por tese</h2><p>Escalas independentes para facilitar a leitura do volume.</p></div><span class="card-icon">${icon('layers', 20)}</span></div>${thesisOverviewChart(data.reports)}</article><article class="card chart-card compact-card"><div class="card-title-row"><div><span class="eyebrow">CONTRATOS</span><h2>Evolução por tese</h2><p>Fechamentos informados em cada semana.</p></div><span class="card-icon">${icon('money', 20)}</span></div>${contractsChart(data.reports)}</article></div>` : ''}

      <article class="card thesis-detail-panel"><div class="table-head"><div><span class="eyebrow">DETALHAMENTO</span><h2>Métricas consolidadas</h2><p>CPL é calculado com investimento ÷ leads. Conversão usa apenas contratos efetivamente informados.</p></div></div>${data.reports.length ? thesisPerformanceCards(data.reports) : emptyState('Nenhum dado para analisar', 'Cadastre um cliente e crie relatórios semanais para liberar a análise de teses.', `<a class="btn btn-primary" href="/relatorios/novo">${icon('plus', 17)} Criar relatório</a>`, 'large')}</article>
    </section>`, 'theses');
    wireGlobalControls();
    wireChartTooltips();
    const form = document.querySelector<HTMLFormElement>('#theses-filters');
    form?.addEventListener('change', () => form.requestSubmit());
    form?.addEventListener('submit', (event) => {
      event.preventDefault();
      const fd = new FormData(form);
      const next = new URLSearchParams();
      for (const key of ['client', 'thesis']) {
        const value = String(fd.get(key) ?? '');
        if (value) next.set(key, value);
      }
      history.replaceState({}, '', `/teses${next.size ? `?${next}` : ''}`);
      void renderTheses();
    });
    document.querySelector('#clear-theses-filters')?.addEventListener('click', () => { history.replaceState({}, '', '/teses'); void renderTheses(); });
  } catch (error) {
    renderError(error, true, 'theses');
  }
}

async function renderReports(): Promise<void> {
  loadingAdmin('reports');
  try {
    const query = new URLSearchParams(location.search);
    const params = new URLSearchParams();
    for (const key of ['client', 'status']) {
      const value = query.get(key);
      if (value) params.set(key, value);
    }
    const [data, exportData] = await Promise.all([api<DashboardPayload>(`/api/dashboard?${params.toString()}`), api<{ exports: ExportRecord[] }>('/api/exports')]);
    const total = data.reports.length;
    const awaiting = data.reports.filter((report) => report.status === 'AWAITING_FEEDBACK').length;
    const responded = total - awaiting;
    const rate = total ? Math.round(responded / total * 100) : 0;
    app.innerHTML = adminShell(`<section class="page reports-page">
      <header class="page-heading"><div><span class="eyebrow">CENTRAL DE RELATÓRIOS</span><h1>Histórico, envio e exportação</h1><p>Esta área concentra o ciclo completo de cada relatório semanal, do link público ao feedback final.</p></div><div class="page-heading-actions"><button class="btn btn-secondary" type="button" id="export-general" ${total ? '' : 'disabled'}>${icon('report', 17)} Exportar planilha</button><a class="btn btn-primary" href="/relatorios/novo">${icon('plus', 17)} Novo relatório</a></div></header>
      <div class="reports-summary-grid"><article class="summary-card"><span>Total no filtro</span><strong>${total}</strong><small>relatórios</small></article><article class="summary-card"><span>Aguardando</span><strong>${awaiting}</strong><small>precisam de feedback</small></article><article class="summary-card"><span>Respondidos</span><strong>${responded}</strong><small>feedback registrado</small></article><article class="summary-card accent"><span>Taxa de resposta</span><strong>${rate}%</strong><small>dentro do filtro</small></article></div>

      <div class="reports-tool-grid">
        <article class="card pending-card pending-card-wide"><div class="card-title-row"><div><span class="eyebrow">PRÓXIMA AÇÃO</span><h2>${awaiting ? `${awaiting} relatório(s) aguardando` : 'Nenhuma pendência'}</h2><p>${awaiting ? 'Copie o link público e envie ao cliente.' : 'Os relatórios deste filtro estão em dia.'}</p></div></div>${awaiting ? `<div class="pending-list">${data.reports.filter((report) => report.status === 'AWAITING_FEEDBACK').slice(0, 6).map((report) => `<div class="pending-item"><div><a class="client-link pending-client-link" href="/clientes/${e(report.clientCode)}"><strong>${e(report.clientName)}</strong></a><span>${e(period(report))}</span></div><button class="icon-btn copy-report-link" data-token="${e(report.token)}" aria-label="Copiar link">${icon('copy', 16)}</button></div>`).join('')}</div>` : `<div class="pending-ok">${icon('check', 24)} <span>Tudo certo por aqui.</span></div>`}</article>
      </div>

      <form id="report-filters" class="filter-toolbar reports-filter"><div class="filter-title">${icon('filter', 17)} <span>Arquivo</span></div><select class="select compact" name="client" aria-label="Cliente"><option value="">Todos os clientes</option>${data.clients.map((client) => `<option value="${e(client.code)}" ${data.filters.clientCode === client.code ? 'selected' : ''}>${e(client.code)} — ${e(client.name)}</option>`).join('')}</select><select class="select compact" name="status" aria-label="Status"><option value="">Todos os status</option><option value="AWAITING_FEEDBACK" ${data.filters.status === 'AWAITING_FEEDBACK' ? 'selected' : ''}>Aguardando feedback</option><option value="RESPONDED" ${data.filters.status === 'RESPONDED' ? 'selected' : ''}>Respondido</option></select><button type="button" class="text-button" id="clear-report-filters">Limpar</button></form>

      <article class="card table-card"><div class="table-head"><div><span class="eyebrow">ARQUIVO COMPLETO</span><h2>Todos os relatórios</h2><p>Consulte período, tese, status, resultado e link público.</p></div></div><div class="table-scroll"><table><thead><tr><th>Cliente</th><th>Período</th><th>Tese</th><th>Status</th><th>Contratos</th><th>Negociação</th><th></th></tr></thead><tbody>${reportRows(data.reports)}</tbody></table></div></article>
      <article class="card table-card export-history-card"><div class="table-head"><div><span class="eyebrow">RASTREABILIDADE</span><h2>Exportações recentes</h2><p>Registro das planilhas geradas pela equipe interna.</p></div></div>${exportData.exports.length ? `<div class="table-scroll"><table><thead><tr><th>Arquivo</th><th>Escopo</th><th>Cliente</th><th>Registros</th><th>Responsável</th><th>Data</th></tr></thead><tbody>${exportData.exports.map((item) => `<tr><td><div class="table-name">${e(item.filename)}</div></td><td>${item.scope === 'REPORT' ? 'Relatório' : 'Geral'}</td><td>${item.clientCode ? `<a class="client-link" href="/clientes/${e(item.clientCode)}">${e(item.clientCode)}</a>` : 'Todos'}</td><td>${item.recordCount}</td><td>${e(item.createdBy)}</td><td>${e(dateTime(item.createdAt))}</td></tr>`).join('')}</tbody></table></div>` : emptyState('Nenhuma exportação ainda', 'As planilhas geradas aparecerão aqui para fins de rastreabilidade.')}</article>
    </section>`, 'reports');
    wireGlobalControls();
    wireCopyButtons();
    document.querySelector<HTMLButtonElement>('#export-general')?.addEventListener('click', async (event) => {
      const button = event.currentTarget as HTMLButtonElement; button.disabled = true;
      try { await downloadXlsx('/api/exports/general', { clientCode: data.filters.clientCode, status: data.filters.status }); toast('Planilha gerada com sucesso.', 'success'); window.setTimeout(() => void renderReports(), 450); }
      catch (error) { toast(error instanceof Error ? error.message : 'Não foi possível exportar.', 'error'); button.disabled = false; }
    });
    const form = document.querySelector<HTMLFormElement>('#report-filters');
    form?.addEventListener('change', () => form.requestSubmit());
    form?.addEventListener('submit', (event) => {
      event.preventDefault();
      const fd = new FormData(form);
      const next = new URLSearchParams();
      for (const key of ['client', 'status']) {
        const value = String(fd.get(key) ?? '');
        if (value) next.set(key, value);
      }
      history.replaceState({}, '', `/relatorios${next.size ? `?${next}` : ''}`);
      void renderReports();
    });
    document.querySelector('#clear-report-filters')?.addEventListener('click', () => { history.replaceState({}, '', '/relatorios'); void renderReports(); });
  } catch (error) {
    renderError(error, true, 'reports');
  }
}

function centsFromInput(value: FormDataEntryValue | null): number {
  let raw = String(value ?? '').trim().replace(/R\$/gi, '').replace(/\s/g, '');
  if (!raw || raw.startsWith('-')) return -1;
  raw = raw.replace(/[^0-9.,]/g, '');
  if (!raw) return -1;
  let normalized = raw;
  if (raw.includes(',')) {
    normalized = raw.replace(/\./g, '').replace(/,(?=[^,]*$)/, '.').replace(/,/g, '');
  } else {
    const dots = raw.split('.');
    if (dots.length > 2 || (dots.length === 2 && dots[1]?.length === 3)) normalized = raw.replace(/\./g, '');
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 100) : -1;
}

function formatMoneyField(input: HTMLInputElement): void {
  if (!input.value.trim()) return;
  const cents = centsFromInput(input.value);
  if (cents < 0) return;
  input.value = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cents / 100);
}

function wireMoneyInputs(root: ParentNode = document): void {
  root.querySelectorAll<HTMLInputElement>('input[data-money]').forEach((input) => {
    input.addEventListener('blur', () => formatMoneyField(input));
    input.addEventListener('change', () => formatMoneyField(input));
    input.addEventListener('input', () => { input.value = input.value.replace(/[^0-9.,R$ \u00A0]/g, ''); });
  });
}

function endOfWeekFromMonday(value: string): string {
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return '';
  date.setUTCDate(date.getUTCDate() + 6);
  return date.toISOString().slice(0, 10);
}

async function renderNewReport(): Promise<void> {
  loadingAdmin('reports');
  try {
    const data = await api<{ clients: ClientSummary[] }>('/api/clients');
    if (!data.clients.length) {
      app.innerHTML = adminShell(`<section class="page form-page"><header class="page-heading"><div><span class="eyebrow">NOVO RELATÓRIO</span><h1>Crie um cliente primeiro</h1><p>Todo relatório precisa pertencer a um cliente e às teses ativas daquele ambiente.</p></div></header><div class="card">${emptyState('Ainda não há clientes cadastrados', 'Cadastre o primeiro cliente e volte aqui para criar o relatório semanal.', '<a class="btn btn-primary" href="/clientes/novo">Cadastrar cliente</a>', 'large')}</div></section>`, 'reports');
      wireGlobalControls();
      return;
    }
    const selectedFromQuery = new URLSearchParams(location.search).get('client') ?? '';
    const options = data.clients.map((client) => `<option value="${e(client.code)}" ${selectedFromQuery === client.code ? 'selected' : ''}>${e(client.code)} — ${e(client.name)}</option>`).join('');
    app.innerHTML = adminShell(`<section class="page form-page report-create-page"><header class="page-heading"><div><a class="back-link" href="/relatorios">${icon('back', 16)} Voltar aos relatórios</a><span class="eyebrow">NOVO RELATÓRIO</span><h1>Prepare a semana do cliente</h1><p>Informe as métricas reais do período. O CPL é calculado automaticamente a partir de investimento ÷ leads.</p></div></header>
      <form id="new-report-form" class="card form-card premium-form">
        <div class="form-section-head"><span class="form-section-icon">${icon('calendar', 20)}</span><div><h2>Cliente e período</h2><p>Os relatórios seguem sempre de segunda-feira a domingo.</p></div></div>
        <div class="form-grid three"><div class="field"><label for="report-client">Cliente</label><select class="select" id="report-client" name="clientCode" required><option value="">Selecione</option>${options}</select><div class="field-error" id="error-clientCode"></div></div><div class="field"><label for="period-start">Segunda-feira</label><input class="input" type="date" id="period-start" name="periodStart" required/><div class="field-error" id="error-periodStart"></div></div><div class="field"><label for="period-end">Domingo</label><input class="input" type="date" id="period-end" name="periodEnd" required/><div class="field-error" id="error-periodEnd"></div></div></div>
        <div class="form-section-head metrics-head"><span class="form-section-icon">${icon('chart', 20)}</span><div><h2>Métricas por tese</h2><p>Preencha apenas os dados consolidados que o cliente deve visualizar.</p></div></div>
        <div id="report-metrics-fields"></div><div class="field-error" id="error-metrics"></div>
        <div class="report-actions"><a class="btn btn-secondary" href="/relatorios">Cancelar</a><button class="btn btn-primary" type="submit">Criar relatório e gerar link ${icon('arrow', 17)}</button></div>
      </form>
    </section>`, 'reports');
    wireGlobalControls();
    const form = document.querySelector<HTMLFormElement>('#new-report-form');
    const clientSelect = document.querySelector<HTMLSelectElement>('#report-client');
    const metricsFields = document.querySelector<HTMLElement>('#report-metrics-fields');
    const startInput = document.querySelector<HTMLInputElement>('#period-start');
    const endInput = document.querySelector<HTMLInputElement>('#period-end');
    const renderMetricFields = () => {
      if (!clientSelect || !metricsFields) return;
      const client = data.clients.find((item) => item.code === clientSelect.value);
      metricsFields.innerHTML = client ? `<div class="metric-input-stack">${client.theses.map((thesis, index) => `<section class="metric-input-card" data-thesis="${e(thesis.slug)}"><div class="metric-input-title"><span>${index + 1}</span><div><strong>${e(thesis.name)}</strong><small>Métricas consolidadas da tese</small></div></div><div class="form-grid three"><div class="field"><label>Investimento</label><div class="money-input"><span>R$</span><input class="input" type="text" inputmode="decimal" data-money name="investment-${e(thesis.slug)}" required placeholder="0,00" autocomplete="off"/></div></div><div class="field"><label>Leads</label><input class="input" type="number" min="0" step="1" name="leads-${e(thesis.slug)}" required placeholder="0"/></div><div class="field"><label>CPC</label><div class="money-input"><span>R$</span><input class="input" type="text" inputmode="decimal" data-money name="cpc-${e(thesis.slug)}" required placeholder="0,00" autocomplete="off"/></div></div></div></section>`).join('')}</div>` : emptyState('Selecione um cliente', 'As teses ativas e os campos de métricas aparecerão aqui.');
    };
    clientSelect?.addEventListener('change', renderMetricFields);
    startInput?.addEventListener('change', () => { if (endInput && startInput.value) endInput.value = endOfWeekFromMonday(startInput.value); });
    renderMetricFields();
    wireMoneyInputs(form ?? document);
    clientSelect?.addEventListener('change', () => window.setTimeout(() => wireMoneyInputs(form ?? document), 0));

    form?.addEventListener('submit', async (event) => {
      event.preventDefault();
      document.querySelectorAll('.field-error').forEach((el) => { el.textContent = ''; });
      const fd = new FormData(form);
      const client = data.clients.find((item) => item.code === String(fd.get('clientCode') ?? ''));
      if (!client) { document.querySelector('#error-clientCode')!.textContent = 'Selecione um cliente.'; return; }
      const metrics: CreateReportPayload['metrics'] = client.theses.map((thesis) => ({
        thesisSlug: thesis.slug,
        investmentCents: centsFromInput(fd.get(`investment-${thesis.slug}`)),
        leads: Number(fd.get(`leads-${thesis.slug}`) ?? -1),
        cpcCents: centsFromInput(fd.get(`cpc-${thesis.slug}`))
      }));
      const payload: CreateReportPayload = { clientCode: client.code, periodStart: String(fd.get('periodStart') ?? ''), periodEnd: String(fd.get('periodEnd') ?? ''), metrics };
      const button = form.querySelector<HTMLButtonElement>('button[type="submit"]');
      if (button) button.disabled = true;
      try {
        const result = await api<{ report: ReportSummary }>('/api/reports', { method: 'POST', body: JSON.stringify(payload) });
        location.href = `/relatorios/${result.report.id}`;
      } catch (error) {
        const typed = error as Error & { fieldErrors?: Record<string, string> };
        for (const [field, message] of Object.entries(typed.fieldErrors ?? {})) {
          const simple = field.split('.')[0] ?? field;
          const el = document.querySelector<HTMLElement>(`#error-${simple}`);
          if (el) el.textContent = message;
        }
        toast(typed.message, 'error');
        if (button) button.disabled = false;
      }
    });
  } catch (error) {
    renderError(error, true, 'reports');
  }
}

function feedbackSummary(feedback: Feedback): string {
  return `<div class="feedback-summary-grid"><div><span>Atendimento</span><strong>${e(attendanceLabel[feedback.attendance])}${feedback.attendanceCount !== null ? ` • ${feedback.attendanceCount}` : ''}</strong></div><div><span>Qualidade</span><strong>${e(qualityLabel[feedback.quality])}</strong></div><div><span>Contrato</span><strong>${e(contractLabel[feedback.contractStatus])}${feedback.contractCount !== null ? ` • ${feedback.contractCount}` : ''}${feedback.negotiationCount !== null ? ` • ${feedback.negotiationCount} em negociação` : ''}</strong></div><div><span>Problemas</span><strong>${feedback.problems.map((problem) => e(problemLabel[problem])).join(', ') || '—'}</strong></div></div>${feedback.otherProblem ? `<p class="feedback-note"><b>Outro:</b> ${e(feedback.otherProblem)}</p>` : ''}${feedback.campaignObservation ? `<p class="feedback-note"><b>Observação da campanha:</b> ${e(feedback.campaignObservation)}</p>` : ''}${feedback.agencyFeedback ? `<p class="feedback-note"><b>Feedback para MN:</b> ${e(feedback.agencyFeedback)}</p>` : ''}`;
}

async function renderAdminReport(id: number): Promise<void> {
  loadingAdmin('reports');
  try {
    const data = await api<{ report: ReportSummary }>(`/api/reports/${id}`);
    const report = data.report;
    app.innerHTML = adminShell(`<section class="page report-detail-page"><header class="page-heading"><div class="report-detail-heading-main"><a class="back-link" href="/relatorios">${icon('back', 16)} Voltar aos relatórios</a><span class="eyebrow report-client-code">${e(report.clientCode)}</span><h1><a class="client-link" href="/clientes/${e(report.clientCode)}">${e(report.clientName)}</a></h1><p>${e(period(report))}</p></div><div class="page-heading-actions"><button class="btn btn-secondary" type="button" id="export-report">${icon('report', 16)} Exportar relatório</button>${statusBadge(report)}${report.status === 'AWAITING_FEEDBACK' ? `<button class="btn btn-secondary copy-report-link" data-token="${e(report.token)}">${icon('copy', 16)} Copiar link</button><a class="btn btn-primary" href="/r/${e(report.token)}" target="_blank" rel="noopener">Abrir como cliente ${icon('external', 16)}</a>` : ''}</div></header>
      <div class="report-detail-grid"><section class="report-detail-main"><article class="card side-panel"><div class="card-title-row"><div><span class="eyebrow">MÉTRICAS</span><h2>Resultados da semana</h2></div></div><div class="admin-metrics-grid">${report.metrics.map((metric) => `<div class="admin-metric-group"><strong>${e(metric.thesisName)}</strong><div class="metric-quads"><span>Investimento<b>${money(metric.investmentCents)}</b></span><span>Leads<b>${metric.leads}</b></span><span>CPL<b>${money(metric.cplCents)}</b></span><span>CPC<b>${money(metric.cpcCents)}</b></span></div></div>`).join('')}</div></article>
      <article class="card side-panel"><div class="card-title-row"><div><span class="eyebrow">FEEDBACK</span><h2>Respostas do cliente</h2></div></div>${report.feedbacks.length ? `<div class="feedback-list">${report.feedbacks.map((feedback) => `<section class="feedback-card"><h3>${e(feedback.thesisName)}</h3>${feedbackSummary(feedback)}</section>`).join('')}</div>` : emptyState('Aguardando feedback', 'Assim que o cliente confirmar as respostas, elas serão organizadas aqui por tese.')}</article></section>
      <aside class="report-detail-side"><article class="card detail-meta-card"><span class="eyebrow">DETALHES</span><div class="detail-meta-row"><span>Status</span>${statusBadge(report)}</div><div class="detail-meta-row"><span>Período</span><strong>${e(period(report))}</strong></div><div class="detail-meta-row"><span>Criado em</span><strong>${e(dateTime(report.sentAt))}</strong></div><div class="detail-meta-row"><span>Respondido em</span><strong>${e(dateTime(report.respondedAt))}</strong></div><div class="detail-meta-row"><span>Teses</span><strong>${report.theses.length}</strong></div></article></aside></div>
    </section>`, 'reports');
    wireGlobalControls();
    wireCopyButtons();
    document.querySelector<HTMLButtonElement>('#export-report')?.addEventListener('click', async (event) => {
      const button = event.currentTarget as HTMLButtonElement; button.disabled = true;
      try { await downloadXlsx(`/api/exports/report/${report.id}`, {}); toast('Relatório exportado em XLSX.', 'success'); }
      catch (error) { toast(error instanceof Error ? error.message : 'Não foi possível exportar.', 'error'); }
      finally { button.disabled = false; }
    });
  } catch (error) {
    renderError(error, true, 'reports');
  }
}

function publicHeader(report: ReportSummary): string {
  return `<header class="public-header"><a class="public-brand" href="#main" aria-label="MN Insights"><img src="/assets/mn-insights-logo-tight.png" alt="MN Insights" /></a><div class="public-header-actions"><span class="period-chip">${icon('calendar', 14)} ${e(period(report))}</span>${themeToggleMarkup(true)}</div></header>`;
}

function createEmptyDraft(metrics: Metrics): FeedbackDraft {
  return { thesisId: metrics.thesisId, attendance: '', attendanceCount: null, quality: '', contractStatus: '', contractCount: null, negotiationCount: null, problems: [], otherProblem: '', campaignObservation: '', agencyFeedback: '' };
}

function validateClientDraft(draft: FeedbackDraft, leads: number): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!draft.attendance) errors.attendance = 'Selecione uma opção.';
  if (!draft.quality) errors.quality = 'Selecione uma opção.';
  if (!draft.contractStatus) errors.contractStatus = 'Selecione uma opção.';
  if (!draft.problems.length) errors.problems = 'Selecione pelo menos uma opção.';
  if (draft.attendance !== 'ALL' && draft.attendanceCount !== null && (!Number.isInteger(draft.attendanceCount) || draft.attendanceCount < 0 || draft.attendanceCount > leads)) errors.attendanceCount = `Informe um número entre 0 e ${leads}.`;
  if (draft.contractStatus === 'YES' && (draft.contractCount === null || !Number.isInteger(draft.contractCount) || draft.contractCount < 1 || draft.contractCount > leads)) errors.contractCount = `Informe um número entre 1 e ${leads}.`;
  if (draft.contractStatus === 'NEGOTIATING' && (draft.negotiationCount === null || !Number.isInteger(draft.negotiationCount) || draft.negotiationCount < 0 || draft.negotiationCount > leads)) errors.negotiationCount = `Informe um número entre 0 e ${leads}.`;
  if (draft.problems.includes('NONE') && draft.problems.length > 1) errors.problems = '“Nenhum problema relevante” deve ficar sozinho.';
  return errors;
}

function optionButton(group: string, value: string, label: string, selected: boolean): string {
  return `<button type="button" class="option-btn" data-group="${e(group)}" data-value="${e(value)}" aria-pressed="${selected}"><span class="option-dot"></span><span>${e(label)}</span>${selected ? `<span class="option-check">${icon('check', 14)}</span>` : ''}</button>`;
}

function checkButton(value: LeadProblem, selected: boolean): string {
  return `<button type="button" class="check-btn" data-problem="${e(value)}" aria-pressed="${selected}"><span class="check-box">${selected ? icon('check', 13) : ''}</span><span>${e(problemLabel[value])}</span></button>`;
}

function publicMetricCards(metrics: Metrics): string {
  return `<div class="public-metrics"><div class="public-metric"><span>Investimento</span><strong>${money(metrics.investmentCents)}</strong></div><div class="public-metric"><span>Leads</span><strong>${metrics.leads}</strong></div><div class="public-metric"><span>CPL</span><strong>${money(metrics.cplCents)}</strong></div><div class="public-metric"><span>CPC</span><strong>${money(metrics.cpcCents)}</strong></div></div>`;
}

function thesisForm(metrics: Metrics, draft: FeedbackDraft, index: number, errors: Record<string, string>): string {
  return `<div class="thesis-form"><div class="thesis-banner"><div><span class="thesis-number">TESE ${index + 1}</span><h2>${e(metrics.thesisName)}</h2><p>Considere apenas os leads desta tese ao responder.</p></div><span class="thesis-banner-icon">${icon('layers', 22)}</span></div>${publicMetricCards(metrics)}
  <div class="question-list">
    <section class="question-card" data-error-field="attendance"><div class="question-label"><span class="question-index">1</span><div><h3>Dos leads recebidos, quantos foram atendidos?</h3><p>Se souber a quantidade exata, você pode informar abaixo.</p></div></div><div class="option-grid">${(['FEW','HALF','MOST','ALL'] as LeadAttendance[]).map((v) => optionButton('attendance', v, attendanceLabel[v], draft.attendance === v)).join('')}</div>${errors.attendance ? `<div class="field-error">${e(errors.attendance)}</div>` : ''}${draft.attendance === 'ALL' ? '' : `<div class="optional-field"><label class="optional-label" for="attendance-count">Quantidade exata <span>opcional</span></label><input id="attendance-count" class="input ${errors.attendanceCount ? 'invalid' : ''}" type="number" min="0" max="${metrics.leads}" step="1" inputmode="numeric" value="${draft.attendanceCount ?? ''}" placeholder="Ex.: 18"/>${errors.attendanceCount ? `<div class="field-error">${e(errors.attendanceCount)}</div>` : ''}</div>`}</section>
    <section class="question-card" data-error-field="quality"><div class="question-label"><span class="question-index">2</span><div><h3>Como você avalia a qualidade dos leads atendidos?</h3><p>Pense no perfil, interesse e aderência dos contatos.</p></div></div><div class="option-grid">${(['POOR','REGULAR','GOOD','VERY_GOOD'] as LeadQuality[]).map((v) => optionButton('quality', v, qualityLabel[v], draft.quality === v)).join('')}</div>${errors.quality ? `<div class="field-error">${e(errors.quality)}</div>` : ''}</section>
    <section class="question-card" data-error-field="contractStatus"><div class="question-label"><span class="question-index">3</span><div><h3>Houve contrato vindo desses leads?</h3><p>Também é possível indicar que as conversas ainda estão em andamento.</p></div></div><div class="option-grid contract-options">${(['YES','NO','NEGOTIATING'] as ContractStatus[]).map((v) => optionButton('contractStatus', v, contractLabel[v], draft.contractStatus === v)).join('')}</div>${errors.contractStatus ? `<div class="field-error">${e(errors.contractStatus)}</div>` : ''}${draft.contractStatus === 'YES' ? `<div class="conditional-field"><label class="optional-label" for="contract-count">Quantos contratos foram fechados?</label><input id="contract-count" class="input ${errors.contractCount ? 'invalid' : ''}" type="number" min="1" max="${metrics.leads}" step="1" inputmode="numeric" value="${draft.contractCount ?? ''}" placeholder="Ex.: 4"/>${errors.contractCount ? `<div class="field-error">${e(errors.contractCount)}</div>` : ''}</div>` : ''}${draft.contractStatus === 'NEGOTIATING' ? `<div class="conditional-field"><label class="optional-label" for="negotiation-count">Quantos leads estão em negociação?</label><input id="negotiation-count" class="input ${errors.negotiationCount ? 'invalid' : ''}" type="number" min="0" max="${metrics.leads}" step="1" inputmode="numeric" pattern="[0-9]*" value="${draft.negotiationCount ?? ''}" placeholder="Ex.: 6"/>${errors.negotiationCount ? `<div class="field-error">${e(errors.negotiationCount)}</div>` : ''}</div>` : ''}</section>
    <section class="question-card" data-error-field="problems"><div class="question-label"><span class="question-index">4</span><div><h3>Quais problemas você percebeu nos leads?</h3><p><strong>Você pode marcar mais de uma opção.</strong> Se nada chamou atenção, selecione “Nenhum problema relevante”.</p></div></div><div class="check-grid">${(['NO_PROFILE','NO_RESPONSE','NO_INTEREST','HAS_LAWYER','OUTSIDE_REGION','NONE','OTHER'] as LeadProblem[]).map((v) => checkButton(v, draft.problems.includes(v))).join('')}</div>${errors.problems ? `<div class="field-error">${e(errors.problems)}</div>` : ''}${draft.problems.includes('OTHER') ? `<div class="conditional-field"><label class="optional-label" for="other-problem">Descreva o outro problema <span>opcional</span></label><input id="other-problem" class="input" maxlength="300" value="${e(draft.otherProblem)}" placeholder="Conte em poucas palavras"/></div>` : ''}</section>
    <section class="question-card optional-question"><div class="question-label"><span class="question-index">5</span><div><h3>Tem alguma observação sobre os leads ou sobre o tráfego?</h3><p>Opcional. Registre apenas algo que ajude a entender melhor a semana.</p></div></div><textarea id="campaign-observation" class="textarea" maxlength="700" placeholder="Ex.: percebi mais pessoas fora do perfil nesta semana...">${e(draft.campaignObservation)}</textarea></section>
    <section class="question-card optional-question"><div class="question-label"><span class="question-index">6</span><div><h3>Tem algum feedback ou solicitação para nossa equipe?</h3><p>Opcional. Use este espaço para pedidos, dúvidas ou contexto adicional.</p></div></div><textarea id="agency-feedback" class="textarea" maxlength="700" placeholder="Escreva aqui se precisar falar algo para a equipe MN.">${e(draft.agencyFeedback)}</textarea></section>
  </div></div>`;
}

function reviewCard(metrics: Metrics, draft: FeedbackDraft, index: number): string {
  return `<article class="review-card"><div class="review-head"><div><span class="eyebrow">TESE ${index + 1}</span><h3>${e(metrics.thesisName)}</h3></div><button type="button" class="btn btn-secondary edit-thesis" data-index="${index}">${icon('edit', 15)} Corrigir</button></div><div class="review-grid"><div class="review-item"><span>Atendimento</span><strong>${draft.attendance ? e(attendanceLabel[draft.attendance]) : '—'}${draft.attendanceCount !== null ? ` • ${draft.attendanceCount}` : ''}</strong></div><div class="review-item"><span>Qualidade</span><strong>${draft.quality ? e(qualityLabel[draft.quality]) : '—'}</strong></div><div class="review-item"><span>Contrato</span><strong>${draft.contractStatus ? e(contractLabel[draft.contractStatus]) : '—'}${draft.contractCount !== null ? ` • ${draft.contractCount}` : ''}${draft.negotiationCount !== null ? ` • ${draft.negotiationCount} em negociação` : ''}</strong></div><div class="review-item"><span>Problemas</span><strong>${draft.problems.map((p) => e(problemLabel[p])).join(', ') || '—'}</strong></div></div>${draft.otherProblem ? `<div class="review-notes"><strong>Outro:</strong> ${e(draft.otherProblem)}</div>` : ''}${draft.campaignObservation ? `<div class="review-notes"><strong>Observação dos leads:</strong> ${e(draft.campaignObservation)}</div>` : ''}${draft.agencyFeedback ? `<div class="review-notes"><strong>Feedback para MN:</strong> ${e(draft.agencyFeedback)}</div>` : ''}</article>`;
}

function safeDraftFromSession(token: string, report: ReportSummary): FeedbackDraft[] {
  try {
    const raw = sessionStorage.getItem(`mn-insights:${token}`);
    if (!raw) return report.metrics.map(createEmptyDraft);
    const parsed = JSON.parse(raw) as { drafts?: FeedbackDraft[] };
    if (!Array.isArray(parsed.drafts) || parsed.drafts.length !== report.metrics.length) return report.metrics.map(createEmptyDraft);
    return report.metrics.map((metric, index) => ({ ...createEmptyDraft(metric), ...parsed.drafts![index], thesisId: metric.thesisId }));
  } catch {
    return report.metrics.map(createEmptyDraft);
  }
}

async function renderPublicReport(token: string): Promise<void> {
  app.innerHTML = `<main class="public-page"><div class="public-container"><div class="skeleton public-loading-logo"></div><div class="skeleton public-loading-card"></div></div></main>`;
  applyTheme(currentTheme());
  try {
    const data = await api<PublicReportPayload>(`/api/public/reports/${encodeURIComponent(token)}`);
    const report = data.report;
    if (data.blocked) {
      sessionStorage.removeItem(`mn-insights:${token}`);
      app.innerHTML = `<main id="main" class="public-page"><div class="public-container">${publicHeader(report)}<section class="report-shell blocked-screen"><div class="success-icon">${icon('check', 34)}</div><span class="eyebrow">RELATÓRIO FINALIZADO</span><h1>Feedback já enviado</h1><p>As respostas deste relatório foram registradas em ${e(dateTime(report.respondedAt))}. Este link não aceita uma segunda resposta.</p></section></div></main>`;
      wireGlobalControls();
      return;
    }

    const drafts = safeDraftFromSession(token, report);
    let step = 0;
    let reviewing = false;
    let submitted = false;
    let errors: Record<string, string> = {};

    const persist = () => sessionStorage.setItem(`mn-insights:${token}`, JSON.stringify({ drafts }));
    const collectTextFields = () => {
      if (reviewing || submitted) return;
      const draft = drafts[step]!;
      const attendanceCount = document.querySelector<HTMLInputElement>('#attendance-count');
      draft.attendanceCount = draft.attendance === 'ALL' ? null : attendanceCount?.value ? Number(attendanceCount.value) : null;
      if (draft.contractStatus === 'YES') {
        const contractCount = document.querySelector<HTMLInputElement>('#contract-count');
        draft.contractCount = contractCount?.value ? Number(contractCount.value) : null;
      } else draft.contractCount = null;
      if (draft.contractStatus === 'NEGOTIATING') {
        const negotiationCount = document.querySelector<HTMLInputElement>('#negotiation-count');
        draft.negotiationCount = negotiationCount?.value ? Number(negotiationCount.value) : negotiationCount?.value === '0' ? 0 : null;
      } else draft.negotiationCount = null;
      draft.otherProblem = document.querySelector<HTMLInputElement>('#other-problem')?.value ?? draft.otherProblem;
      draft.campaignObservation = document.querySelector<HTMLTextAreaElement>('#campaign-observation')?.value ?? draft.campaignObservation;
      draft.agencyFeedback = document.querySelector<HTMLTextAreaElement>('#agency-feedback')?.value ?? draft.agencyFeedback;
      persist();
    };

    const render = () => {
      const progressState = calculateReportProgress(report.metrics.length, step, reviewing);
      const totalSteps = progressState.totalSteps;
      const currentVisualStep = progressState.currentStep;
      const progress = progressState.percent;
      let body = '';
      if (submitted) {
        body = `<div class="success-screen"><div class="success-icon">${icon('check', 34)}</div><span class="eyebrow">CONCLUÍDO</span><h1>Feedback enviado com sucesso</h1><p>Obrigado por responder com atenção. Suas informações já estão organizadas para a equipe da MN.</p></div>`;
      } else if (reviewing) {
        body = `<div class="report-content review-content"><div class="thesis-header"><div><span class="thesis-number">REVISÃO FINAL</span><h2>Confira antes de confirmar</h2><p>As respostas estão separadas por tese. Você ainda pode voltar e corrigir qualquer informação.</p></div></div><div class="review-list">${report.metrics.map((metrics, index) => reviewCard(metrics, drafts[index]!, index)).join('')}</div><div class="confirm-note">Depois de confirmar, este relatório será finalizado e não poderá ser alterado por este link.</div><div class="report-actions"><button type="button" class="btn btn-secondary" id="review-back">${icon('back', 17)} Voltar</button><button type="button" class="btn btn-primary" id="confirm-submit">Confirmar envio ${icon('check', 17)}</button></div></div>`;
      } else {
        const metrics = report.metrics[step]!;
        body = `<div class="report-content">${thesisForm(metrics, drafts[step]!, step, errors)}<div class="report-actions">${step > 0 ? `<button type="button" class="btn btn-secondary" id="prev-step">${icon('back', 17)} Voltar</button>` : '<span></span>'}<button type="button" class="btn btn-primary" id="next-step">${step < report.metrics.length - 1 ? `Avançar ${icon('arrow', 17)}` : `Revisar respostas ${icon('arrow', 17)}`}</button></div></div>`;
      }
      app.innerHTML = `<main id="main" class="public-page"><div class="public-container">${publicHeader(report)}<section class="report-shell"><header class="report-intro"><div class="report-intro-copy"><span class="report-client">${e(report.clientCode)} • ${e(report.clientName)}</span><h1>Relatório semanal</h1><p>Responda com cuidado: seu feedback nos ajuda a entender o que acontece depois do lead e a buscar resultados cada vez melhores.</p></div><div class="report-intro-icon"><img src="/assets/rocket-brand.png" alt="" /></div></header>${submitted ? '' : `<div class="progress-wrap"><div class="progress-meta"><span>Etapa ${currentVisualStep} de ${totalSteps}${reviewing ? ' · Correção' : ''}</span><strong>${progress}%</strong></div><progress class="progress-track progress-element" max="100" value="${progress}" aria-label="Progresso do relatório: ${progress}%">${progress}%</progress></div>`}${body}</section><p class="public-footer-copy">MN Insights • feedback simples, histórico organizado.</p></div></main>`;
      wireGlobalControls();
      wirePublicEvents();
    };

    const focusFirstError = () => {
      const firstBlock = document.querySelector<HTMLElement>('[data-error-field] .field-error');
      firstBlock?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      firstBlock?.closest<HTMLElement>('[data-error-field]')?.querySelector<HTMLElement>('button, input, textarea')?.focus();
    };

    const wirePublicEvents = () => {
      if (submitted) return;
      if (reviewing) {
        document.querySelector('#review-back')?.addEventListener('click', () => { reviewing = false; step = report.metrics.length - 1; render(); });
        document.querySelectorAll<HTMLButtonElement>('.edit-thesis').forEach((button) => button.addEventListener('click', () => { reviewing = false; step = Number(button.dataset.index ?? 0); errors = {}; render(); }));
        document.querySelector('#confirm-submit')?.addEventListener('click', async () => {
          const button = document.querySelector<HTMLButtonElement>('#confirm-submit');
          if (!button) return;
          button.disabled = true;
          button.textContent = 'Enviando…';
          try {
            const payload: SubmitFeedbackPayload = { answers: drafts };
            await api<{ report: ReportSummary }>(`/api/public/reports/${encodeURIComponent(token)}/submit`, { method: 'POST', body: JSON.stringify(payload) });
            sessionStorage.removeItem(`mn-insights:${token}`);
            submitted = true;
            render();
          } catch (error) {
            const typed = error as Error & { status?: number };
            if (typed.status === 409) { location.reload(); return; }
            toast(typed.message, 'error');
            button.disabled = false;
            button.innerHTML = `Confirmar envio ${icon('check', 17)}`;
          }
        });
        return;
      }

      document.querySelectorAll<HTMLButtonElement>('.option-btn').forEach((button) => button.addEventListener('click', () => {
        collectTextFields();
        const draft = drafts[step]!;
        const group = button.dataset.group;
        const value = button.dataset.value;
        if (group === 'attendance') { draft.attendance = value as LeadAttendance; if (draft.attendance === 'ALL') draft.attendanceCount = null; }
        if (group === 'quality') draft.quality = value as LeadQuality;
        if (group === 'contractStatus') {
          draft.contractStatus = value as ContractStatus;
          if (draft.contractStatus !== 'YES') draft.contractCount = null;
          if (draft.contractStatus !== 'NEGOTIATING') draft.negotiationCount = null;
        }
        errors = {};
        persist();
        render();
      }));

      document.querySelectorAll<HTMLButtonElement>('.check-btn').forEach((button) => button.addEventListener('click', () => {
        collectTextFields();
        const draft = drafts[step]!;
        const problem = button.dataset.problem as LeadProblem;
        if (problem === 'NONE') {
          draft.problems = draft.problems.includes('NONE') ? [] : ['NONE'];
        } else {
          draft.problems = draft.problems.filter((p) => p !== 'NONE');
          draft.problems = draft.problems.includes(problem) ? draft.problems.filter((p) => p !== problem) : [...draft.problems, problem];
        }
        errors = {};
        persist();
        render();
      }));

      document.querySelector('#prev-step')?.addEventListener('click', () => { collectTextFields(); step = Math.max(0, step - 1); errors = {}; render(); });
      document.querySelector('#next-step')?.addEventListener('click', () => {
        collectTextFields();
        const metrics = report.metrics[step]!;
        errors = validateClientDraft(drafts[step]!, metrics.leads);
        if (Object.keys(errors).length) { render(); window.setTimeout(focusFirstError, 0); return; }
        if (step < report.metrics.length - 1) { step += 1; errors = {}; } else reviewing = true;
        persist();
        render();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });

      ['attendance-count','contract-count','negotiation-count','other-problem','campaign-observation','agency-feedback'].forEach((id) => {
        document.querySelector(`#${id}`)?.addEventListener('input', collectTextFields);
      });
      document.querySelector<HTMLInputElement>('#negotiation-count')?.addEventListener('keydown', (event) => {
        if (['e', 'E', '+', '-', '.', ','].includes(event.key)) event.preventDefault();
      });
    };

    render();
  } catch (error) {
    renderError(error, false, 'dashboard');
  }
}

type AuthCharacterState = 'neutral' | 'email' | 'password' | 'hidden' | 'error' | 'success';

function authCharacterMarkup(): string {
  return `<div class="auth-character-stage" aria-hidden="true">
    <div class="auth-character-halo"></div>
    <div class="auth-character" id="auth-character">
      <svg class="auth-character-body" viewBox="0 0 190 172" role="presentation">
        <defs><linearGradient id="mnTriangleGradient" x1="30" y1="18" x2="160" y2="160" gradientUnits="userSpaceOnUse"><stop stop-color="#41C7D8"/><stop offset=".52" stop-color="#0B7698"/><stop offset="1" stop-color="#315FD1"/></linearGradient></defs>
        <path d="M95 11c8.6 0 15.8 4.4 20.1 12.1l67.1 119.4c8.3 14.8-2.4 33-19.4 33H27.2c-17 0-27.7-18.2-19.4-33L74.9 23.1C79.2 15.4 86.4 11 95 11Z" fill="url(#mnTriangleGradient)"/>
        <path d="M93 21c8.1 0 13.1 4 17.2 11.2l55.4 98.5" fill="none" stroke="rgba(255,255,255,.18)" stroke-width="5" stroke-linecap="round"/>
      </svg>
      <div class="auth-character-face">
        <span class="auth-brow auth-brow-left"></span><span class="auth-brow auth-brow-right"></span>
        <span class="auth-eye auth-eye-left"><span class="auth-pupil"></span></span>
        <span class="auth-eye auth-eye-right"><span class="auth-pupil"></span></span>
        <span class="auth-mouth"></span>
      </div>
    </div>
    <span class="auth-character-caption">Seu acesso interno está protegido.</span>
  </div>`;
}

function wireAuthCharacter(): { setState: (state: AuthCharacterState) => void } {
  const character = document.querySelector<HTMLElement>('#auth-character');
  const stage = document.querySelector<HTMLElement>('.auth-character-stage');
  const email = document.querySelector<HTMLInputElement>('#admin-email');
  const password = document.querySelector<HTMLInputElement>('#admin-password');
  const confirm = document.querySelector<HTMLInputElement>('#admin-confirm');
  const toggle = document.querySelector<HTMLButtonElement>('#toggle-password');
  const states: AuthCharacterState[] = ['neutral', 'email', 'password', 'hidden', 'error', 'success'];

  const setState = (state: AuthCharacterState) => {
    if (!character) return;
    for (const item of states) character.classList.remove(`is-${item}`);
    character.classList.add(`is-${state}`);
  };

  const stateFromFocus = () => {
    if (password?.type === 'text') { setState('hidden'); return; }
    if (document.activeElement === email) { setState('email'); return; }
    if (document.activeElement === password || document.activeElement === confirm) { setState('password'); return; }
    setState('neutral');
  };

  email?.addEventListener('focus', stateFromFocus);
  email?.addEventListener('input', stateFromFocus);
  password?.addEventListener('focus', stateFromFocus);
  password?.addEventListener('input', stateFromFocus);
  confirm?.addEventListener('focus', stateFromFocus);
  confirm?.addEventListener('input', stateFromFocus);
  for (const field of [email, password, confirm]) field?.addEventListener('blur', () => window.setTimeout(stateFromFocus, 0));

  toggle?.addEventListener('click', () => {
    if (!password) return;
    const showing = password.type === 'password';
    password.type = showing ? 'text' : 'password';
    toggle.setAttribute('aria-pressed', String(showing));
    toggle.setAttribute('aria-label', showing ? 'Ocultar senha' : 'Mostrar senha');
    toggle.innerHTML = showing ? icon('eyeOff', 18) : icon('eye', 18);
    stateFromFocus();
    password.focus({ preventScroll: true });
  });

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia('(pointer: fine)').matches;
  if (character && stage && finePointer && !reducedMotion) {
    let frame = 0;
    let pendingX = 0;
    let pendingY = 0;
    const updateEyes = () => {
      frame = 0;
      const rect = character.getBoundingClientRect();
      const dx = pendingX - (rect.left + rect.width / 2);
      const dy = pendingY - (rect.top + rect.height * .5);
      const length = Math.hypot(dx, dy) || 1;
      const distance = Math.min(4.5, length / 34);
      character.style.setProperty('--eye-x', `${dx / length * distance}px`);
      character.style.setProperty('--eye-y', `${dy / length * distance}px`);
    };
    window.addEventListener('pointermove', (event) => {
      pendingX = event.clientX;
      pendingY = event.clientY;
      if (!frame) frame = window.requestAnimationFrame(updateEyes);
    }, { passive: true });
    window.addEventListener('blur', () => {
      character.style.setProperty('--eye-x', '0px');
      character.style.setProperty('--eye-y', '0px');
    });
  }

  setState('neutral');
  return { setState };
}

async function renderAuthPage(mode: 'login' | 'setup'): Promise<void> {
  applyTheme(currentTheme());
  const setup = mode === 'setup';
  app.innerHTML = `<main id="main" class="auth-page"><div class="auth-shell">
    <section class="auth-brand-panel"><div class="auth-brand"><img src="/assets/mn-insights-logo-tight.png" alt="MN Insights" /></div>${authCharacterMarkup()}<div class="auth-brand-copy"><span class="eyebrow">ÁREA INTERNA</span><h1>${setup ? 'Configure o acesso da equipe.' : 'Bem-vindo de volta.'}</h1><p>A área administrativa permanece separada dos links públicos enviados aos clientes.</p></div></section>
    <section class="auth-form-panel"><div class="auth-top">${themeToggleMarkup(true)}</div><form id="auth-form" class="auth-form" novalidate><span class="eyebrow">${setup ? 'PRIMEIRO ACESSO' : 'ACESSO INTERNO'}</span><h2>${setup ? 'Criar acesso administrativo' : 'Entrar no MN Insights'}</h2><p>${setup ? 'Cadastre a credencial interna deste ambiente. A senha é armazenada somente como hash seguro.' : 'Use seu e-mail e senha internos para acessar clientes, relatórios e exportações.'}</p>
      ${setup ? `<div class="field"><label for="admin-name">Seu nome</label><input class="input" id="admin-name" name="name" maxlength="80" autocomplete="name" required placeholder="Ex.: Maurício"/><div class="field-error" id="error-name"></div></div>` : ''}
      <div class="field"><label for="admin-email">E-mail</label><input class="input" id="admin-email" name="email" type="email" maxlength="160" autocomplete="username" required placeholder="voce@mnmarketing.com.br"/><div class="field-error" id="error-email"></div></div>
      <div class="field"><label for="admin-password">Senha</label><div class="password-control"><input class="input" id="admin-password" name="password" type="password" minlength="12" maxlength="160" autocomplete="${setup ? 'new-password' : 'current-password'}" required placeholder="${setup ? 'Mínimo de 12 caracteres' : 'Sua senha interna'}"/><button class="password-toggle" id="toggle-password" type="button" aria-label="Mostrar senha" aria-pressed="false">${icon('eye', 18)}</button></div><div class="field-error" id="error-password"></div></div>
      ${setup ? `<div class="field"><label for="admin-confirm">Confirmar senha</label><input class="input" id="admin-confirm" name="confirm" type="password" minlength="12" maxlength="160" autocomplete="new-password" required placeholder="Digite novamente"/></div>` : ''}
      <div class="auth-security-note">${icon('check', 17)} <span>Sessão protegida por cookie HttpOnly, validação CSRF e expiração automática.</span></div>
      <div class="field-error auth-error" id="auth-error" role="alert"></div><button class="btn btn-primary auth-submit" type="submit">${setup ? 'Criar acesso interno' : 'Entrar'} ${icon('arrow', 17)}</button>
    </form></section>
  </div></main>`;
  wireGlobalControls();
  const character = wireAuthCharacter();
  const form = document.querySelector<HTMLFormElement>('#auth-form');
  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    document.querySelectorAll<HTMLElement>('#auth-form .field-error').forEach((el) => { el.textContent = ''; });
    const fd = new FormData(form);
    const email = String(fd.get('email') ?? '').trim();
    const password = String(fd.get('password') ?? '');
    const errorEl = document.querySelector<HTMLElement>('#auth-error');
    if (!email) { const target = document.querySelector<HTMLElement>('#error-email'); if (target) target.textContent = 'Informe seu e-mail.'; character.setState('error'); return; }
    if (setup && password !== String(fd.get('confirm') ?? '')) { if (errorEl) errorEl.textContent = 'As senhas não coincidem.'; character.setState('error'); return; }
    const button = form.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (button) { button.disabled = true; button.textContent = setup ? 'Criando acesso…' : 'Entrando…'; }
    try {
      const payload = setup ? { name: String(fd.get('name') ?? ''), email, password } : { email, password };
      const state = await api<AuthSessionPayload>(setup ? '/api/auth/setup' : '/api/auth/login', { method: 'POST', body: JSON.stringify(payload) });
      adminCsrfToken = state.csrfToken ?? '';
      adminUserName = state.user?.name ?? 'Equipe MN';
      character.setState('success');
      window.setTimeout(() => { location.href = '/dashboard'; }, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 280);
    } catch (error) {
      const typed = error as Error & { fieldErrors?: Record<string, string> };
      if (errorEl) errorEl.textContent = typed.message;
      for (const [field, message] of Object.entries(typed.fieldErrors ?? {})) { const target = document.querySelector<HTMLElement>(`#error-${field}`); if (target) target.textContent = message; }
      character.setState('error');
      if (button) { button.disabled = false; button.innerHTML = `${setup ? 'Criar acesso interno' : 'Entrar'} ${icon('arrow', 17)}`; }
    }
  });
}

function renderError(error: unknown, admin: boolean, active: AdminSection): void {
  const message = error instanceof Error ? error.message : 'Não foi possível carregar esta página.';
  const panel = `<section class="error-state"><div class="card error-panel"><div class="empty-orbit"><div class="empty-icon">${icon('alert', 24)}</div></div><span class="eyebrow">ALGO DEU ERRADO</span><h1>Não foi possível continuar</h1><p>${e(message)}</p><a class="btn btn-primary" href="${admin ? '/dashboard' : '/'}">Voltar</a></div></section>`;
  app.innerHTML = admin ? adminShell(panel, active) : `<main class="public-page">${panel}</main>`;
  wireGlobalControls();
}

async function route(): Promise<void> {
  applyTheme(currentTheme());
  const path = location.pathname.replace(/\/+$/, '') || '/';
  if (path === '/login') return renderAuthPage('login');
  if (path === '/setup-admin') return renderAuthPage('setup');
  const publicReport = path.match(/^\/r\/([A-Za-z0-9_-]{16,80})$/);
  if (publicReport) return renderPublicReport(publicReport[1]!);
  if (!(await loadAdminSession())) return;
  if (path === '/' || path === '/dashboard') return renderDashboard();
  if (path === '/clientes') return renderClients();
  if (path === '/clientes/novo') return renderNewClient();
  const client = path.match(/^\/clientes\/(MN\d{3,})$/);
  if (client) return renderClient(client[1]!);
  if (path === '/relatorios') return renderReports();
  if (path === '/teses') return renderTheses();
  if (path === '/relatorios/novo') return renderNewReport();
  const adminReport = path.match(/^\/relatorios\/(\d+)$/);
  if (adminReport) return renderAdminReport(Number(adminReport[1]));
  renderError(new Error('Página não encontrada.'), true, 'dashboard');
}

void route();
