import { randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { AGENCY_BASE_CLIENTS } from './agency-base.js';
import type {
  ClientDetailPayload,
  ClientSummary,
  ContractStatus,
  CreateClientPayload,
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
  NotificationType,
  ReportStatus,
  ReportSummary,
  SubmitFeedbackPayload,
  ThesisSlug,
  ThesisSummary
} from './shared/types.js';
import {
  CONTRACT_STATUS_VALUES,
  LEAD_ATTENDANCE_VALUES,
  LEAD_PROBLEM_VALUES,
  LEAD_QUALITY_VALUES,
  REPORT_STATUSES,
  THESIS_SLUGS
} from './shared/types.js';

interface DbOptions {
  seed?: boolean;
}

interface ClientRow {
  id: number;
  code: string;
  name: string;
  active: number;
  created_at: string;
}

interface ThesisRow {
  id: number;
  slug: ThesisSlug;
  name: string;
}

interface ReportRow {
  id: number;
  client_id: number;
  client_code: string;
  client_name: string;
  period_start: string;
  period_end: string;
  status: ReportStatus;
  token: string;
  sent_at: string;
  responded_at: string | null;
}

interface MetricRow {
  report_id: number;
  thesis_id: number;
  thesis_slug: ThesisSlug;
  thesis_name: string;
  investment_cents: number;
  leads: number;
  cpl_cents: number;
  cpc_cents: number;
}

interface FeedbackRow {
  id: number;
  report_id: number;
  thesis_id: number;
  thesis_slug: ThesisSlug;
  thesis_name: string;
  attendance: LeadAttendance;
  attendance_count: number | null;
  quality: LeadQuality;
  contract_status: ContractStatus;
  contract_count: number | null;
  negotiation_count: number | null;
  other_problem: string | null;
  campaign_observation: string | null;
  agency_feedback: string | null;
}

interface ProblemRow {
  feedback_id: number;
  problem_code: LeadProblem;
}

interface CountRow {
  count: number;
}

interface MaxCodeRow {
  max_num: number | null;
}

interface LatestPeriodRow {
  period_start: string;
  period_end: string;
}

interface NotificationRow {
  id: number;
  type: NotificationType;
  title: string;
  message: string;
  report_id: number;
  client_id: number;
  client_code: string;
  client_name: string;
  read_at: string | null;
  created_at: string;
}

export class ValidationError extends Error {
  readonly fieldErrors: Record<string, string>;

  constructor(message: string, fieldErrors: Record<string, string> = {}) {
    super(message);
    this.name = 'ValidationError';
    this.fieldErrors = fieldErrors;
  }
}

export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConflictError';
  }
}

function rows<T>(value: unknown[]): T[] {
  return value as T[];
}

function row<T>(value: unknown): T | undefined {
  return value as T | undefined;
}

function inList<T extends string>(value: unknown, list: readonly T[]): value is T {
  return typeof value === 'string' && (list as readonly string[]).includes(value);
}

function cleanOptionalText(value: unknown, maxLength = 700): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = value.trim();
  if (!cleaned) return null;
  return cleaned.slice(0, maxLength);
}

function assertPositiveOptionalInteger(value: unknown, fieldName: string, max: number): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > max) {
    throw new ValidationError('Existem campos inválidos.', { [fieldName]: `Informe um número inteiro entre 0 e ${max}.` });
  }
  return value;
}

function validateDraft(draft: FeedbackDraft, leads: number): FeedbackDraft {
  const errors: Record<string, string> = {};

  if (!inList(draft.attendance, LEAD_ATTENDANCE_VALUES)) errors.attendance = 'Selecione quantos leads foram atendidos.';
  if (!inList(draft.quality, LEAD_QUALITY_VALUES)) errors.quality = 'Selecione uma avaliação de qualidade.';
  if (!inList(draft.contractStatus, CONTRACT_STATUS_VALUES)) errors.contractStatus = 'Selecione a situação dos contratos.';
  if (!Array.isArray(draft.problems) || draft.problems.length === 0) errors.problems = 'Selecione pelo menos uma opção.';

  const problems = Array.isArray(draft.problems)
    ? Array.from(new Set(draft.problems.filter((item): item is LeadProblem => inList(item, LEAD_PROBLEM_VALUES))))
    : [];

  if (problems.includes('NONE') && problems.length > 1) {
    errors.problems = '“Nenhum problema relevante” não pode ser combinado com outros problemas.';
  }

  let attendanceCount: number | null = null;
  if (draft.attendance !== 'ALL') {
    try {
      attendanceCount = assertPositiveOptionalInteger(draft.attendanceCount, 'attendanceCount', leads);
    } catch (error) {
      if (error instanceof ValidationError) Object.assign(errors, error.fieldErrors);
    }
  }

  let contractCount: number | null = null;
  if (draft.contractStatus === 'YES') {
    if (draft.contractCount === null || draft.contractCount === undefined) {
      errors.contractCount = 'Informe quantos contratos foram fechados.';
    } else {
      try {
        contractCount = assertPositiveOptionalInteger(draft.contractCount, 'contractCount', leads);
        if (contractCount !== null && contractCount < 1) errors.contractCount = 'Informe pelo menos 1 contrato.';
      } catch (error) {
        if (error instanceof ValidationError) Object.assign(errors, error.fieldErrors);
      }
    }
  }

  let negotiationCount: number | null = null;
  if (draft.contractStatus === 'NEGOTIATING') {
    if (draft.negotiationCount === null || draft.negotiationCount === undefined) {
      errors.negotiationCount = 'Informe quantos leads estão em negociação.';
    } else {
      try {
        negotiationCount = assertPositiveOptionalInteger(draft.negotiationCount, 'negotiationCount', leads);
      } catch (error) {
        if (error instanceof ValidationError) Object.assign(errors, error.fieldErrors);
      }
    }
  }

  if (Object.keys(errors).length > 0) throw new ValidationError('Revise os campos destacados.', errors);

  return {
    thesisId: draft.thesisId,
    attendance: draft.attendance,
    attendanceCount,
    quality: draft.quality,
    contractStatus: draft.contractStatus,
    contractCount: draft.contractStatus === 'YES' ? contractCount : null,
    negotiationCount: draft.contractStatus === 'NEGOTIATING' ? negotiationCount : null,
    problems,
    otherProblem: cleanOptionalText(draft.otherProblem, 300) ?? '',
    campaignObservation: cleanOptionalText(draft.campaignObservation, 700) ?? '',
    agencyFeedback: cleanOptionalText(draft.agencyFeedback, 700) ?? ''
  };
}

export function createDatabase(databasePath: string, options: DbOptions = {}): DatabaseSync {
  const db = new DatabaseSync(databasePath);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
  migrate(db);
  ensureCatalog(db);
  if (options.seed !== false) ensureAgencyBase(db);
  return db;
}

function migrate(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS clients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS theses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS client_theses (
      client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      thesis_id INTEGER NOT NULL REFERENCES theses(id) ON DELETE RESTRICT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (client_id, thesis_id)
    );

    CREATE TABLE IF NOT EXISTS reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      period_start TEXT NOT NULL,
      period_end TEXT NOT NULL,
      token TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL CHECK (status IN ('AWAITING_FEEDBACK', 'RESPONDED')),
      sent_at TEXT NOT NULL,
      responded_at TEXT,
      UNIQUE (client_id, period_start, period_end)
    );

    CREATE TABLE IF NOT EXISTS report_metrics (
      report_id INTEGER NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
      thesis_id INTEGER NOT NULL REFERENCES theses(id) ON DELETE RESTRICT,
      investment_cents INTEGER NOT NULL CHECK (investment_cents >= 0),
      leads INTEGER NOT NULL CHECK (leads >= 0),
      cpl_cents INTEGER NOT NULL CHECK (cpl_cents >= 0),
      cpc_cents INTEGER NOT NULL CHECK (cpc_cents >= 0),
      PRIMARY KEY (report_id, thesis_id)
    );

    CREATE TABLE IF NOT EXISTS feedbacks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      report_id INTEGER NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
      thesis_id INTEGER NOT NULL REFERENCES theses(id) ON DELETE RESTRICT,
      attendance TEXT NOT NULL CHECK (attendance IN ('FEW','HALF','MOST','ALL')),
      attendance_count INTEGER,
      quality TEXT NOT NULL CHECK (quality IN ('POOR','REGULAR','GOOD','VERY_GOOD')),
      contract_status TEXT NOT NULL CHECK (contract_status IN ('YES','NO','NEGOTIATING')),
      contract_count INTEGER,
      negotiation_count INTEGER CHECK (negotiation_count IS NULL OR negotiation_count >= 0),
      other_problem TEXT,
      campaign_observation TEXT,
      agency_feedback TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (report_id, thesis_id)
    );

    CREATE TABLE IF NOT EXISTS feedback_problems (
      feedback_id INTEGER NOT NULL REFERENCES feedbacks(id) ON DELETE CASCADE,
      problem_code TEXT NOT NULL CHECK (problem_code IN ('NO_PROFILE','NO_RESPONSE','NO_INTEREST','HAS_LAWYER','OUTSIDE_REGION','NONE','OTHER')),
      PRIMARY KEY (feedback_id, problem_code)
    );

    CREATE TABLE IF NOT EXISTS admin_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('INTERNAL')),
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS admin_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      csrf_token TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_key TEXT NOT NULL UNIQUE,
      type TEXT NOT NULL CHECK (type IN ('REPORT_RESPONDED','REPORT_WAITING','REPORT_LATE')),
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      report_id INTEGER NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
      client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      read_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS export_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scope TEXT NOT NULL CHECK (scope IN ('REPORT','GENERAL')),
      client_code TEXT,
      report_id INTEGER REFERENCES reports(id) ON DELETE SET NULL,
      filename TEXT NOT NULL,
      record_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      created_by TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor TEXT NOT NULL,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      metadata TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_reports_client_period ON reports(client_id, period_start DESC);
    CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);
    CREATE INDEX IF NOT EXISTS idx_metrics_thesis ON report_metrics(thesis_id);
    CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(read_at, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_notifications_report ON notifications(report_id, created_at DESC);
  `);

  const feedbackColumns = new Set(rows<{ name: string }>(db.prepare('PRAGMA table_info(feedbacks)').all()).map((item) => item.name));
  if (!feedbackColumns.has('negotiation_count')) {
    db.exec('ALTER TABLE feedbacks ADD COLUMN negotiation_count INTEGER CHECK (negotiation_count IS NULL OR negotiation_count >= 0);');
  }

  const adminColumns = new Set(rows<{ name: string }>(db.prepare('PRAGMA table_info(admin_users)').all()).map((item) => item.name));
  if (!adminColumns.has('email')) db.exec('ALTER TABLE admin_users ADD COLUMN email TEXT;');
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_users_email ON admin_users(email) WHERE email IS NOT NULL;');
}

function ensureCatalog(db: DatabaseSync): void {
  const insert = db.prepare('INSERT OR IGNORE INTO theses (slug, name) VALUES (?, ?)');
  const catalog: Array<[ThesisSlug, string]> = [
    ['salario-maternidade', 'Salário-Maternidade'],
    ['segundo-salario-maternidade', 'Segundo Salário-Maternidade'],
    ['bpc-transtornos-mentais', 'BPC Transtornos Mentais'],
    ['bpc-pessoa-com-deficiencia', 'BPC Pessoa com Deficiência'],
    ['bpc-tdah', 'BPC TDAH'],
    ['bpc-autismo', 'BPC Autismo'],
    ['beneficio-por-incapacidade', 'Benefício por Incapacidade'],
    ['auxilio-acidente', 'Auxílio-Acidente'],
    ['aposentadoria-pcd', 'Aposentadoria da Pessoa com Deficiência (PCD)'],
    ['aposentadoria-professor', 'Aposentadoria do Professor']
  ];
  catalog.forEach(([slug, name]) => insert.run(slug, name));
}

function ensureAgencyBase(db: DatabaseSync): void {
  const importKey = 'AGENCY_BASE_2026_09';
  const imported = db.prepare(`
    SELECT 1
    FROM audit_logs
    WHERE action = 'AGENCY_BASE_IMPORTED' AND entity_type = 'SYSTEM' AND entity_id = ?
    LIMIT 1
  `);
  const existingClient = db.prepare('SELECT id FROM clients WHERE code = ?');
  const insertClient = db.prepare('INSERT INTO clients (code, name, active, created_at) VALUES (?, ?, 1, ?)');
  const updateClient = db.prepare('UPDATE clients SET name = ?, active = 1 WHERE id = ?');
  const thesisBySlug = db.prepare('SELECT id FROM theses WHERE slug = ?');
  const linkThesis = db.prepare(`
    INSERT INTO client_theses (client_id, thesis_id, sort_order)
    VALUES (?, ?, ?)
    ON CONFLICT(client_id, thesis_id) DO UPDATE SET sort_order = excluded.sort_order
  `);
  const markImported = db.prepare(`
    INSERT INTO audit_logs (actor, action, entity_type, entity_id, metadata, created_at)
    VALUES ('SYSTEM', 'AGENCY_BASE_IMPORTED', 'SYSTEM', ?, ?, ?)
  `);

  db.exec('BEGIN IMMEDIATE;');
  try {
    if (imported.get(importKey)) {
      db.exec('COMMIT;');
      return;
    }

    for (const item of AGENCY_BASE_CLIENTS) {
      const found = row<{ id: number }>(existingClient.get(item.code));
      let clientId: number;
      if (found) {
        clientId = found.id;
        updateClient.run(item.name, clientId);
      } else {
        const result = insertClient.run(item.code, item.name, new Date().toISOString());
        clientId = Number(result.lastInsertRowid);
      }

      item.thesisSlugs.forEach((slug, index) => {
        const thesis = row<{ id: number }>(thesisBySlug.get(slug));
        if (!thesis) throw new Error(`Tese da base da agência não cadastrada: ${slug}`);
        linkThesis.run(clientId, thesis.id, index);
      });
    }

    markImported.run(importKey, JSON.stringify({ clients: AGENCY_BASE_CLIENTS.length }), new Date().toISOString());
    db.exec('COMMIT;');
  } catch (error) {
    db.exec('ROLLBACK;');
    throw error;
  }
}

function makeToken(): string {
  return `rpt_${randomBytes(18).toString('base64url')}`;
}

function listTheses(db: DatabaseSync): ThesisSummary[] {
  return rows<ThesisRow>(db.prepare('SELECT id, slug, name FROM theses ORDER BY id').all()).map((item) => ({
    id: item.id,
    slug: item.slug,
    name: item.name
  }));
}

function clientTheses(db: DatabaseSync, clientId: number): ThesisSummary[] {
  return rows<ThesisRow>(db.prepare(`
    SELECT t.id, t.slug, t.name
    FROM theses t
    JOIN client_theses ct ON ct.thesis_id = t.id
    WHERE ct.client_id = ?
    ORDER BY ct.sort_order, t.id
  `).all(clientId)).map((item) => ({ id: item.id, slug: item.slug, name: item.name }));
}

function metricsForReport(db: DatabaseSync, reportId: number): Metrics[] {
  return rows<MetricRow>(db.prepare(`
    SELECT rm.report_id, t.id AS thesis_id, t.slug AS thesis_slug, t.name AS thesis_name,
           rm.investment_cents, rm.leads, rm.cpl_cents, rm.cpc_cents
    FROM report_metrics rm
    JOIN theses t ON t.id = rm.thesis_id
    WHERE rm.report_id = ?
    ORDER BY rm.thesis_id
  `).all(reportId)).map((item) => ({
    thesisId: item.thesis_id,
    thesisSlug: item.thesis_slug,
    thesisName: item.thesis_name,
    investmentCents: item.investment_cents,
    leads: item.leads,
    cplCents: item.cpl_cents,
    cpcCents: item.cpc_cents
  }));
}

function feedbacksForReport(db: DatabaseSync, reportId: number): Feedback[] {
  const feedbackRows = rows<FeedbackRow>(db.prepare(`
    SELECT f.id, f.report_id, f.thesis_id, t.slug AS thesis_slug, t.name AS thesis_name,
           f.attendance, f.attendance_count, f.quality, f.contract_status, f.contract_count, f.negotiation_count,
           f.other_problem, f.campaign_observation, f.agency_feedback
    FROM feedbacks f
    JOIN theses t ON t.id = f.thesis_id
    WHERE f.report_id = ?
    ORDER BY f.thesis_id
  `).all(reportId));

  const problemStmt = db.prepare('SELECT feedback_id, problem_code FROM feedback_problems WHERE feedback_id = ? ORDER BY problem_code');
  return feedbackRows.map((item) => ({
    thesisId: item.thesis_id,
    thesisSlug: item.thesis_slug,
    thesisName: item.thesis_name,
    attendance: item.attendance,
    attendanceCount: item.attendance_count,
    quality: item.quality,
    contractStatus: item.contract_status,
    contractCount: item.contract_count,
    negotiationCount: item.negotiation_count,
    problems: rows<ProblemRow>(problemStmt.all(item.id)).map((problem) => problem.problem_code),
    otherProblem: item.other_problem,
    campaignObservation: item.campaign_observation,
    agencyFeedback: item.agency_feedback
  }));
}

function mapReport(db: DatabaseSync, item: ReportRow): ReportSummary {
  const metrics = metricsForReport(db, item.id);
  return {
    id: item.id,
    clientId: item.client_id,
    clientCode: item.client_code,
    clientName: item.client_name,
    periodStart: item.period_start,
    periodEnd: item.period_end,
    status: item.status,
    token: item.token,
    sentAt: item.sent_at,
    respondedAt: item.responded_at,
    theses: metrics.map((metric) => ({ id: metric.thesisId, slug: metric.thesisSlug, name: metric.thesisName })),
    metrics,
    feedbacks: feedbacksForReport(db, item.id)
  };
}

function saoPauloDate(value: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(value);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year ?? ''}-${map.month ?? ''}-${map.day ?? ''}`;
}

function calendarDayDiff(start: string, end: string): number {
  const startMs = Date.parse(`${start}T00:00:00.000Z`);
  const endMs = Date.parse(`${end}T00:00:00.000Z`);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return 0;
  return Math.max(0, Math.floor((endMs - startMs) / 86_400_000));
}

function insertNotificationOnce(db: DatabaseSync, input: {
  eventKey: string;
  type: NotificationType;
  title: string;
  message: string;
  reportId: number;
  clientId: number;
  createdAt: string;
}): void {
  db.prepare(`
    INSERT OR IGNORE INTO notifications (event_key, type, title, message, report_id, client_id, read_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, NULL, ?)
  `).run(input.eventKey, input.type, input.title, input.message, input.reportId, input.clientId, input.createdAt);
}

export function syncReportNotifications(db: DatabaseSync, now = new Date()): void {
  const today = saoPauloDate(now);
  const awaiting = rows<ReportRow>(db.prepare(`
    SELECT r.id, r.client_id, c.code AS client_code, c.name AS client_name,
           r.period_start, r.period_end, r.status, r.token, r.sent_at, r.responded_at
    FROM reports r
    JOIN clients c ON c.id = r.client_id
    WHERE r.status = 'AWAITING_FEEDBACK'
  `).all());

  for (const report of awaiting) {
    if (today > report.period_end) {
      insertNotificationOnce(db, {
        eventKey: `report:${report.id}:late`,
        type: 'REPORT_LATE',
        title: 'Relatório atrasado',
        message: `${report.client_code} — ${report.client_name} está com o relatório atrasado.`,
        reportId: report.id,
        clientId: report.client_id,
        createdAt: now.toISOString()
      });
      continue;
    }

    const sentDate = saoPauloDate(new Date(report.sent_at));
    const waitingDays = calendarDayDiff(sentDate, today);
    if (waitingDays < 1) continue;
    const dayLabel = waitingDays === 1 ? '1 dia' : `${waitingDays} dias`;
    insertNotificationOnce(db, {
      eventKey: `report:${report.id}:waiting:${waitingDays}`,
      type: 'REPORT_WAITING',
      title: 'Relatório aguardando',
      message: `${report.client_code} — ${report.client_name} está aguardando resposta há ${dayLabel}.`,
      reportId: report.id,
      clientId: report.client_id,
      createdAt: now.toISOString()
    });
  }
}

function notificationFromRow(item: NotificationRow): NotificationSummary {
  return {
    id: item.id,
    type: item.type,
    title: item.title,
    message: item.message,
    reportId: item.report_id,
    clientId: item.client_id,
    clientCode: item.client_code,
    clientName: item.client_name,
    readAt: item.read_at,
    createdAt: item.created_at
  };
}

export function listNotifications(db: DatabaseSync, limit = 30, now = new Date()): { notifications: NotificationSummary[]; unreadCount: number } {
  syncReportNotifications(db, now);
  const safeLimit = Math.min(100, Math.max(1, Math.trunc(limit)));
  const items = rows<NotificationRow>(db.prepare(`
    SELECT n.id, n.type, n.title, n.message, n.report_id, n.client_id,
           c.code AS client_code, c.name AS client_name, n.read_at, n.created_at
    FROM notifications n
    JOIN clients c ON c.id = n.client_id
    ORDER BY n.created_at DESC, n.id DESC
    LIMIT ?
  `).all(safeLimit)).map(notificationFromRow);
  const unread = row<CountRow>(db.prepare('SELECT COUNT(*) AS count FROM notifications WHERE read_at IS NULL').get());
  return { notifications: items, unreadCount: Number(unread?.count ?? 0) };
}

export function markNotificationRead(db: DatabaseSync, notificationId: number, now = new Date()): boolean {
  if (!Number.isInteger(notificationId) || notificationId < 1) return false;
  const result = db.prepare('UPDATE notifications SET read_at = COALESCE(read_at, ?) WHERE id = ?').run(now.toISOString(), notificationId);
  return result.changes === 1;
}

export function markAllNotificationsRead(db: DatabaseSync, now = new Date()): number {
  const result = db.prepare('UPDATE notifications SET read_at = ? WHERE read_at IS NULL').run(now.toISOString());
  return Number(result.changes);
}

function baseReportRows(db: DatabaseSync, whereSql = '', params: unknown[] = []): ReportRow[] {
  return rows<ReportRow>(db.prepare(`
    SELECT r.id, r.client_id, c.code AS client_code, c.name AS client_name,
           r.period_start, r.period_end, r.status, r.token, r.sent_at, r.responded_at
    FROM reports r
    JOIN clients c ON c.id = r.client_id
    ${whereSql}
    ORDER BY r.period_start DESC, c.code ASC
  `).all(...params));
}

export function listClients(db: DatabaseSync): ClientSummary[] {
  const clientRows = rows<ClientRow>(db.prepare('SELECT id, code, name, active, created_at FROM clients ORDER BY code').all());
  const latestStmt = db.prepare(`
    SELECT r.id, r.client_id, c.code AS client_code, c.name AS client_name,
           r.period_start, r.period_end, r.status, r.token, r.sent_at, r.responded_at
    FROM reports r JOIN clients c ON c.id = r.client_id
    WHERE r.client_id = ? ORDER BY r.period_start DESC LIMIT 1
  `);

  return clientRows.map((item) => {
    const latestRow = row<ReportRow>(latestStmt.get(item.id));
    const base: ClientSummary = {
      id: item.id,
      code: item.code,
      name: item.name,
      active: item.active === 1,
      createdAt: item.created_at,
      theses: clientTheses(db, item.id)
    };
    if (latestRow) base.latestReport = mapReport(db, latestRow);
    return base;
  });
}

export function getClientDetail(db: DatabaseSync, code: string): ClientDetailPayload | null {
  const clientRow = row<ClientRow>(db.prepare('SELECT id, code, name, active, created_at FROM clients WHERE code = ?').get(code));
  if (!clientRow) return null;
  const client: ClientSummary = {
    id: clientRow.id,
    code: clientRow.code,
    name: clientRow.name,
    active: clientRow.active === 1,
    createdAt: clientRow.created_at,
    theses: clientTheses(db, clientRow.id)
  };
  const reportRows = baseReportRows(db, 'WHERE r.client_id = ?', [clientRow.id]);
  const reports = reportRows.map((item) => mapReport(db, item));
  if (reports[0]) client.latestReport = reports[0];
  return { client, reports };
}

export function getReportById(db: DatabaseSync, reportId: number): ReportSummary | null {
  const reportRow = row<ReportRow>(db.prepare(`
    SELECT r.id, r.client_id, c.code AS client_code, c.name AS client_name,
           r.period_start, r.period_end, r.status, r.token, r.sent_at, r.responded_at
    FROM reports r JOIN clients c ON c.id = r.client_id WHERE r.id = ?
  `).get(reportId));
  return reportRow ? mapReport(db, reportRow) : null;
}

export function getReportByToken(db: DatabaseSync, token: string): ReportSummary | null {
  const reportRow = row<ReportRow>(db.prepare(`
    SELECT r.id, r.client_id, c.code AS client_code, c.name AS client_name,
           r.period_start, r.period_end, r.status, r.token, r.sent_at, r.responded_at
    FROM reports r JOIN clients c ON c.id = r.client_id WHERE r.token = ?
  `).get(token));
  return reportRow ? mapReport(db, reportRow) : null;
}

export function submitReportFeedback(db: DatabaseSync, token: string, payload: SubmitFeedbackPayload): ReportSummary {
  const report = getReportByToken(db, token);
  if (!report) throw new ValidationError('Relatório não encontrado.');
  if (report.status === 'RESPONDED') throw new ConflictError('Este relatório já foi respondido.');

  if (!payload || !Array.isArray(payload.answers)) throw new ValidationError('Respostas inválidas.');
  if (payload.answers.length !== report.metrics.length) throw new ValidationError('Responda todas as teses antes de confirmar.');

  const reportThesisIds = new Set(report.metrics.map((metric) => metric.thesisId));
  const answerThesisIds = payload.answers.map((answer) => answer.thesisId);
  if (new Set(answerThesisIds).size !== answerThesisIds.length || answerThesisIds.some((id) => !reportThesisIds.has(id))) {
    throw new ValidationError('As respostas não correspondem às teses deste relatório.');
  }

  const validated = payload.answers.map((answer) => {
    const metrics = report.metrics.find((metric) => metric.thesisId === answer.thesisId);
    if (!metrics) throw new ValidationError('Tese inválida.');
    return validateDraft(answer, metrics.leads);
  });

  db.exec('BEGIN IMMEDIATE;');
  try {
    const fresh = row<{ status: ReportStatus }>(db.prepare('SELECT status FROM reports WHERE id = ?').get(report.id));
    if (!fresh || fresh.status === 'RESPONDED') throw new ConflictError('Este relatório já foi respondido.');

    const insertFeedback = db.prepare(`
      INSERT INTO feedbacks (
        report_id, thesis_id, attendance, attendance_count, quality, contract_status,
        contract_count, negotiation_count, other_problem, campaign_observation, agency_feedback
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertProblem = db.prepare('INSERT INTO feedback_problems (feedback_id, problem_code) VALUES (?, ?)');

    for (const answer of validated) {
      const result = insertFeedback.run(
        report.id,
        answer.thesisId,
        answer.attendance,
        answer.attendanceCount,
        answer.quality,
        answer.contractStatus,
        answer.contractCount,
        answer.negotiationCount,
        cleanOptionalText(answer.otherProblem, 300),
        cleanOptionalText(answer.campaignObservation, 700),
        cleanOptionalText(answer.agencyFeedback, 700)
      );
      const feedbackId = Number(result.lastInsertRowid);
      for (const problem of answer.problems) insertProblem.run(feedbackId, problem);
    }

    const respondedAt = new Date().toISOString();
    const updateResult = db.prepare(`
      UPDATE reports
      SET status = 'RESPONDED', responded_at = ?
      WHERE id = ? AND status = 'AWAITING_FEEDBACK'
    `).run(respondedAt, report.id);
    if (updateResult.changes !== 1) throw new ConflictError('Este relatório já foi respondido.');

    insertNotificationOnce(db, {
      eventKey: `report:${report.id}:responded`,
      type: 'REPORT_RESPONDED',
      title: 'Relatório respondido',
      message: `${report.clientCode} — ${report.clientName} respondeu o relatório.`,
      reportId: report.id,
      clientId: report.clientId,
      createdAt: respondedAt
    });

    db.exec('COMMIT;');
  } catch (error) {
    db.exec('ROLLBACK;');
    if (error instanceof Error && /UNIQUE constraint failed: feedbacks\.report_id, feedbacks\.thesis_id/.test(error.message)) {
      throw new ConflictError('Este relatório já foi respondido.');
    }
    throw error;
  }

  const updated = getReportById(db, report.id);
  if (!updated) throw new Error('Falha ao carregar o relatório atualizado.');
  return updated;
}

export function createClient(db: DatabaseSync, payload: CreateClientPayload): ClientSummary {
  const name = typeof payload?.name === 'string' ? payload.name.trim() : '';
  const thesisSlugs = Array.isArray(payload?.thesisSlugs)
    ? Array.from(new Set(payload.thesisSlugs.filter((slug): slug is ThesisSlug => inList(slug, THESIS_SLUGS))))
    : [];

  const errors: Record<string, string> = {};
  if (name.length < 3 || name.length > 100) errors.name = 'Informe um nome entre 3 e 100 caracteres.';
  if (thesisSlugs.length < 1 || thesisSlugs.length > 2) errors.thesisSlugs = 'Selecione uma ou duas teses.';
  if (Object.keys(errors).length > 0) throw new ValidationError('Revise os dados do cliente.', errors);

  const maxRow = row<MaxCodeRow>(db.prepare("SELECT MAX(CAST(SUBSTR(code, 3) AS INTEGER)) AS max_num FROM clients WHERE code GLOB 'MN[0-9][0-9][0-9]*'").get());
  const next = (maxRow?.max_num ?? -1) + 1;
  const code = `MN${String(next).padStart(3, '0')}`;

  db.exec('BEGIN IMMEDIATE;');
  try {
    const result = db.prepare('INSERT INTO clients (code, name, active, created_at) VALUES (?, ?, 1, ?)').run(code, name, new Date().toISOString());
    const clientId = Number(result.lastInsertRowid);
    const thesisStmt = db.prepare('SELECT id, slug, name FROM theses WHERE slug = ?');
    const linkStmt = db.prepare('INSERT INTO client_theses (client_id, thesis_id, sort_order) VALUES (?, ?, ?)');
    thesisSlugs.forEach((slug, index) => {
      const thesis = row<ThesisRow>(thesisStmt.get(slug));
      if (!thesis) throw new ValidationError('Tese não cadastrada.');
      linkStmt.run(clientId, thesis.id, index);
    });
    db.exec('COMMIT;');
  } catch (error) {
    db.exec('ROLLBACK;');
    throw error;
  }

  const detail = getClientDetail(db, code);
  if (!detail) throw new Error('Falha ao carregar o cliente criado.');
  return detail.client;
}


function parseIsoDate(value: unknown): Date | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function validateReportPeriod(startValue: unknown, endValue: unknown): { start: string; end: string } {
  const start = parseIsoDate(startValue);
  const end = parseIsoDate(endValue);
  const errors: Record<string, string> = {};
  if (!start) errors.periodStart = 'Informe a segunda-feira de início do período.';
  if (!end) errors.periodEnd = 'Informe o domingo de encerramento do período.';
  if (start && start.getUTCDay() !== 1) errors.periodStart = 'O período deve começar em uma segunda-feira.';
  if (end && end.getUTCDay() !== 0) errors.periodEnd = 'O período deve terminar em um domingo.';
  if (start && end) {
    const days = Math.round((end.getTime() - start.getTime()) / 86_400_000);
    if (days !== 6) errors.periodEnd = 'O relatório deve representar exatamente uma semana, de segunda a domingo.';
  }
  if (Object.keys(errors).length) throw new ValidationError('Revise o período do relatório.', errors);
  return { start: String(startValue), end: String(endValue) };
}

function parseMoneyCents(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 100_000_000_00) {
    throw new ValidationError('Revise as métricas do relatório.', { [field]: 'Informe um valor monetário válido.' });
  }
  return value;
}

function parseNonNegativeInteger(value: unknown, field: string, max = 10_000_000): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > max) {
    throw new ValidationError('Revise as métricas do relatório.', { [field]: 'Informe um número inteiro válido.' });
  }
  return value;
}

export function createReport(db: DatabaseSync, payload: CreateReportPayload): ReportSummary {
  const clientCode = typeof payload?.clientCode === 'string' ? payload.clientCode.trim() : '';
  const client = getClientDetail(db, clientCode)?.client;
  if (!client) throw new ValidationError('Cliente não encontrado.', { clientCode: 'Selecione um cliente válido.' });

  const { start, end } = validateReportPeriod(payload?.periodStart, payload?.periodEnd);
  if (!Array.isArray(payload?.metrics) || payload.metrics.length < 1 || payload.metrics.length > 2) {
    throw new ValidationError('Revise as métricas do relatório.', { metrics: 'Informe as métricas das teses ativas.' });
  }

  const clientSlugs = new Set(client.theses.map((thesis) => thesis.slug));
  const seen = new Set<ThesisSlug>();
  const normalized = payload.metrics.map((metric, index) => {
    const slug = metric?.thesisSlug;
    if (!inList(slug, THESIS_SLUGS) || !clientSlugs.has(slug)) {
      throw new ValidationError('Revise as métricas do relatório.', { [`metrics.${index}.thesisSlug`]: 'Tese inválida para este cliente.' });
    }
    if (seen.has(slug)) {
      throw new ValidationError('Revise as métricas do relatório.', { metrics: 'Cada tese pode aparecer apenas uma vez.' });
    }
    seen.add(slug);
    const investmentCents = parseMoneyCents(metric.investmentCents, `metrics.${index}.investmentCents`);
    const leads = parseNonNegativeInteger(metric.leads, `metrics.${index}.leads`);
    const cpcCents = parseMoneyCents(metric.cpcCents, `metrics.${index}.cpcCents`);
    const cplCents = leads > 0 ? Math.round(investmentCents / leads) : 0;
    return { slug, investmentCents, leads, cplCents, cpcCents };
  });

  const activeSlugs = client.theses.map((thesis) => thesis.slug);
  if (normalized.length !== activeSlugs.length || activeSlugs.some((slug) => !seen.has(slug))) {
    throw new ValidationError('Revise as métricas do relatório.', { metrics: 'Informe as métricas de todas as teses ativas do cliente.' });
  }

  db.exec('BEGIN IMMEDIATE;');
  try {
    const reportResult = db.prepare(`
      INSERT INTO reports (client_id, period_start, period_end, token, status, sent_at, responded_at)
      VALUES (?, ?, ?, ?, 'AWAITING_FEEDBACK', ?, NULL)
    `).run(client.id, start, end, makeToken(), new Date().toISOString());

    const reportId = Number(reportResult.lastInsertRowid);
    const thesisStmt = db.prepare('SELECT id, slug, name FROM theses WHERE slug = ?');
    const metricStmt = db.prepare(`
      INSERT INTO report_metrics (report_id, thesis_id, investment_cents, leads, cpl_cents, cpc_cents)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    for (const metric of normalized) {
      const thesis = row<ThesisRow>(thesisStmt.get(metric.slug));
      if (!thesis) throw new ValidationError('Tese não cadastrada.');
      metricStmt.run(reportId, thesis.id, metric.investmentCents, metric.leads, metric.cplCents, metric.cpcCents);
    }
    db.exec('COMMIT;');

    const created = getReportById(db, reportId);
    if (!created) throw new Error('Falha ao carregar o relatório criado.');
    return created;
  } catch (error) {
    db.exec('ROLLBACK;');
    if (error instanceof Error && /UNIQUE constraint failed: reports\.client_id, reports\.period_start, reports\.period_end/.test(error.message)) {
      throw new ConflictError('Já existe um relatório deste cliente para esse período.');
    }
    throw error;
  }
}

export function getDashboard(
  db: DatabaseSync,
  filterInput: { clientCode?: string | null; thesisSlug?: string | null; status?: string | null } = {}
): DashboardPayload {
  const clientCode = typeof filterInput.clientCode === 'string' && filterInput.clientCode ? filterInput.clientCode : null;
  const thesisSlug = inList(filterInput.thesisSlug, THESIS_SLUGS) ? filterInput.thesisSlug : null;
  const status = inList(filterInput.status, REPORT_STATUSES) ? filterInput.status : null;

  const where: string[] = [];
  const params: unknown[] = [];
  if (clientCode) {
    where.push('c.code = ?');
    params.push(clientCode);
  }
  if (status) {
    where.push('r.status = ?');
    params.push(status);
  }
  if (thesisSlug) {
    where.push('EXISTS (SELECT 1 FROM report_metrics rm2 JOIN theses t2 ON t2.id = rm2.thesis_id WHERE rm2.report_id = r.id AND t2.slug = ?)');
    params.push(thesisSlug);
  }

  const reportRows = baseReportRows(db, where.length ? `WHERE ${where.join(' AND ')}` : '', params);
  const reports = reportRows.map((item) => mapReport(db, item));
  const filteredReports = thesisSlug
    ? reports.map((report) => ({
        ...report,
        theses: report.theses.filter((thesis) => thesis.slug === thesisSlug),
        metrics: report.metrics.filter((metric) => metric.thesisSlug === thesisSlug),
        feedbacks: report.feedbacks.filter((feedback) => feedback.thesisSlug === thesisSlug)
      }))
    : reports;

  const latestPeriodRow = row<LatestPeriodRow>(db.prepare('SELECT period_start, period_end FROM reports ORDER BY period_start DESC LIMIT 1').get());
  const latestPeriod = latestPeriodRow ? { start: latestPeriodRow.period_start, end: latestPeriodRow.period_end } : null;
  const latestFiltered = latestPeriod ? filteredReports.filter((report) => report.periodStart === latestPeriod.start) : [];

  const relevantFeedbacks = filteredReports.flatMap((report) => report.feedbacks);
  const contractsReported = relevantFeedbacks.reduce((sum, feedback) => sum + (feedback.contractCount ?? 0), 0);
  const negotiatingSignals = relevantFeedbacks.filter((feedback) => feedback.contractStatus === 'NEGOTIATING').length;

  const qualityDistribution = LEAD_QUALITY_VALUES.map((quality) => ({
    quality,
    count: relevantFeedbacks.filter((feedback) => feedback.quality === quality).length
  }));
  const problemDistribution = LEAD_PROBLEM_VALUES.filter((problem) => problem !== 'NONE').map((problem) => ({
    problem,
    count: relevantFeedbacks.filter((feedback) => feedback.problems.includes(problem)).length
  })).filter((item) => item.count > 0);

  const cplHistory = filteredReports
    .slice()
    .reverse()
    .flatMap((report) => report.metrics.map((metric) => ({
      periodStart: report.periodStart,
      periodEnd: report.periodEnd,
      thesisName: metric.thesisName,
      valueCents: metric.cplCents
    })));

  const leadsHistory = filteredReports
    .slice()
    .reverse()
    .flatMap((report) => report.metrics.map((metric) => ({
      periodStart: report.periodStart,
      periodEnd: report.periodEnd,
      thesisName: metric.thesisName,
      leads: metric.leads
    })));

  return {
    filters: { clientCode, thesisSlug, status },
    clients: listClients(db),
    theses: listTheses(db),
    reports: filteredReports,
    kpis: {
      activeClients: listClients(db).filter((client) => client.active).length,
      reportsInLatestPeriod: latestFiltered.length,
      awaitingInLatestPeriod: latestFiltered.filter((report) => report.status === 'AWAITING_FEEDBACK').length,
      respondedInLatestPeriod: latestFiltered.filter((report) => report.status === 'RESPONDED').length,
      contractsReported,
      negotiatingSignals,
      reportsTotal: filteredReports.length,
      awaitingReports: filteredReports.filter((report) => report.status === 'AWAITING_FEEDBACK').length,
      respondedReports: filteredReports.filter((report) => report.status === 'RESPONDED').length,
      responseRate: filteredReports.length
        ? Math.round((filteredReports.filter((report) => report.status === 'RESPONDED').length / filteredReports.length) * 100)
        : 0
    },
    latestPeriod,
    cplHistory,
    leadsHistory,
    qualityDistribution,
    problemDistribution
  };
}


export function recordAudit(db: DatabaseSync, input: { actor: string; action: string; entityType: string; entityId?: string | number | null; metadata?: Record<string, unknown> }): void {
  const metadata = input.metadata ? JSON.stringify(input.metadata).slice(0, 4000) : null;
  db.prepare(`INSERT INTO audit_logs (actor, action, entity_type, entity_id, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(input.actor.slice(0, 120), input.action.slice(0, 80), input.entityType.slice(0, 80), input.entityId == null ? null : String(input.entityId).slice(0, 120), metadata, new Date().toISOString());
}

export function recordExport(db: DatabaseSync, input: { scope: 'REPORT' | 'GENERAL'; clientCode?: string | null; reportId?: number | null; filename: string; recordCount: number; createdBy: string }): ExportRecord {
  const createdAt = new Date().toISOString();
  const result = db.prepare(`
    INSERT INTO export_logs (scope, client_code, report_id, filename, record_count, created_at, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(input.scope, input.clientCode ?? null, input.reportId ?? null, input.filename.slice(0, 220), Math.max(0, Math.trunc(input.recordCount)), createdAt, input.createdBy.slice(0, 120));
  return {
    id: Number(result.lastInsertRowid),
    scope: input.scope,
    clientCode: input.clientCode ?? null,
    reportId: input.reportId ?? null,
    filename: input.filename,
    recordCount: Math.max(0, Math.trunc(input.recordCount)),
    createdAt,
    createdBy: input.createdBy
  };
}

export function listExports(db: DatabaseSync, limit = 30): ExportRecord[] {
  const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
  return rows<{ id: number; scope: 'REPORT' | 'GENERAL'; client_code: string | null; report_id: number | null; filename: string; record_count: number; created_at: string; created_by: string }>(db.prepare(`
    SELECT id, scope, client_code, report_id, filename, record_count, created_at, created_by
    FROM export_logs ORDER BY created_at DESC LIMIT ?
  `).all(safeLimit)).map((item) => ({
    id: item.id,
    scope: item.scope,
    clientCode: item.client_code,
    reportId: item.report_id,
    filename: item.filename,
    recordCount: item.record_count,
    createdAt: item.created_at,
    createdBy: item.created_by
  }));
}
