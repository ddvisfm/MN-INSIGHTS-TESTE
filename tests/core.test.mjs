import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ConflictError,
  ValidationError,
  createClient,
  createDatabase,
  createReport,
  getDashboard,
  getReportByToken,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  submitReportFeedback
} from '../dist/db.js';
import { calculateReportProgress } from '../dist/shared/report-progress.js';

function freshDb() {
  return createDatabase(':memory:', { seed: false });
}

function mondaySunday() {
  return { periodStart: '2026-08-31', periodEnd: '2026-09-06' };
}

function createSingleThesisScenario(db) {
  const client = createClient(db, { name: 'Cliente Real', thesisSlugs: ['salario-maternidade'] });
  const report = createReport(db, {
    clientCode: client.code,
    ...mondaySunday(),
    metrics: [{ thesisSlug: 'salario-maternidade', investmentCents: 100000, leads: 50, cpcCents: 250 }]
  });
  return { client, report };
}

function createTwoThesisScenario(db) {
  const client = createClient(db, { name: 'Escritório Dois', thesisSlugs: ['salario-maternidade', 'bpc-transtornos-mentais'] });
  const report = createReport(db, {
    clientCode: client.code,
    ...mondaySunday(),
    metrics: [
      { thesisSlug: 'salario-maternidade', investmentCents: 90000, leads: 45, cpcCents: 220 },
      { thesisSlug: 'bpc-transtornos-mentais', investmentCents: 120000, leads: 40, cpcCents: 310 }
    ]
  });
  return { client, report };
}

function validDraft(metric, overrides = {}) {
  return {
    thesisId: metric.thesisId,
    attendance: 'MOST',
    attendanceCount: Math.min(metric.leads, 12),
    quality: 'GOOD',
    contractStatus: 'YES',
    contractCount: 2,
    negotiationCount: null,
    problems: ['NO_RESPONSE'],
    otherProblem: '',
    campaignObservation: 'Atendimento organizado.',
    agencyFeedback: '',
    ...overrides
  };
}

test('banco isolado sem carga da agência mantém catálogo completo e nenhum relatório', () => {
  const db = freshDb();
  const dashboard = getDashboard(db);
  assert.equal(dashboard.clients.length, 0);
  assert.equal(dashboard.reports.length, 0);
  assert.equal(dashboard.kpis.activeClients, 0);
  assert.equal(dashboard.theses.length, 10);
  db.close();
});

test('base real da agência é carregada de forma idempotente sem criar relatórios', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mn-insights-base-'));
  const path = join(dir, 'base.db');
  try {
    let db = createDatabase(path);
    let dashboard = getDashboard(db);
    assert.equal(dashboard.clients.length, 43);
    assert.equal(dashboard.kpis.activeClients, 43);
    assert.equal(dashboard.reports.length, 0);
    assert.equal(dashboard.theses.length, 10);

    const mn027 = dashboard.clients.find((client) => client.code === 'MN027');
    assert.equal(mn027?.name, 'Jaqueline Rossoni');
    assert.deepEqual(mn027?.theses.map((thesis) => thesis.slug), ['bpc-pessoa-com-deficiencia', 'bpc-transtornos-mentais']);

    const mn121 = dashboard.clients.find((client) => client.code === 'MN121');
    assert.deepEqual(mn121?.theses.map((thesis) => thesis.slug), ['auxilio-acidente', 'aposentadoria-professor']);
    assert.equal(dashboard.clients.some((client) => client.code === 'MN108'), false);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM audit_logs WHERE action = 'AGENCY_BASE_IMPORTED'").get().count, 1);
    db.prepare("UPDATE clients SET name = 'Nome preservado após carga' WHERE code = 'MN001'").run();
    db.close();

    db = createDatabase(path);
    dashboard = getDashboard(db);
    assert.equal(dashboard.clients.length, 43);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM client_theses').get().count, 50);
    assert.equal(db.prepare("SELECT name FROM clients WHERE code = 'MN001'").get().name, 'Nome preservado após carga');
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM audit_logs WHERE action = 'AGENCY_BASE_IMPORTED'").get().count, 1);
    assert.equal(dashboard.reports.length, 0);
    db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('cadastro manual continua disponível depois da carga inicial da agência', () => {
  const db = createDatabase(':memory:');
  const client = createClient(db, { name: 'Novo Cliente Manual', thesisSlugs: ['auxilio-acidente'] });
  assert.equal(client.code, 'MN176');
  assert.equal(client.name, 'Novo Cliente Manual');
  assert.deepEqual(client.theses.map((thesis) => thesis.slug), ['auxilio-acidente']);
  db.close();
});

test('cadastro de cliente gera código sequencial MN', () => {
  const db = freshDb();
  const first = createClient(db, { name: 'Primeiro Cliente', thesisSlugs: ['salario-maternidade'] });
  const second = createClient(db, { name: 'Segundo Cliente', thesisSlugs: ['bpc-transtornos-mentais'] });
  assert.equal(first.code, 'MN000');
  assert.equal(second.code, 'MN001');
  db.close();
});

test('criação de relatório gera token único e calcula CPL', () => {
  const db = freshDb();
  const { report } = createSingleThesisScenario(db);
  assert.equal(report.status, 'AWAITING_FEEDBACK');
  assert.ok(report.token.startsWith('rpt_'));
  assert.equal(report.metrics[0].cplCents, 2000);
  const byToken = getReportByToken(db, report.token);
  assert.equal(byToken?.id, report.id);
  db.close();
});

test('período do relatório precisa ser segunda a domingo', () => {
  const db = freshDb();
  const client = createClient(db, { name: 'Cliente Período', thesisSlugs: ['salario-maternidade'] });
  assert.throws(() => createReport(db, {
    clientCode: client.code,
    periodStart: '2026-09-01',
    periodEnd: '2026-09-07',
    metrics: [{ thesisSlug: 'salario-maternidade', investmentCents: 1000, leads: 1, cpcCents: 100 }]
  }), ValidationError);
  db.close();
});

test('status muda para Respondido depois da confirmação', () => {
  const db = freshDb();
  const { report } = createSingleThesisScenario(db);
  const updated = submitReportFeedback(db, report.token, { answers: [validDraft(report.metrics[0])] });
  assert.equal(updated.status, 'RESPONDED');
  assert.ok(updated.respondedAt);
  db.close();
});

test('relatório não pode ser respondido duas vezes', () => {
  const db = freshDb();
  const { report } = createSingleThesisScenario(db);
  const payload = { answers: [validDraft(report.metrics[0])] };
  submitReportFeedback(db, report.token, payload);
  assert.throws(() => submitReportFeedback(db, report.token, payload), ConflictError);
  db.close();
});

test('duas teses preservam respostas separadamente', () => {
  const db = freshDb();
  const { report } = createTwoThesisScenario(db);
  const answers = [
    validDraft(report.metrics[0], { quality: 'VERY_GOOD', contractCount: 5, problems: ['NONE'] }),
    validDraft(report.metrics[1], { quality: 'REGULAR', contractStatus: 'NEGOTIATING', contractCount: null, negotiationCount: 7, problems: ['NO_PROFILE', 'NO_RESPONSE'] })
  ];
  const updated = submitReportFeedback(db, report.token, { answers });
  assert.equal(updated.feedbacks.length, 2);
  const first = updated.feedbacks.find((f) => f.thesisId === report.metrics[0].thesisId);
  const second = updated.feedbacks.find((f) => f.thesisId === report.metrics[1].thesisId);
  assert.equal(first?.quality, 'VERY_GOOD');
  assert.equal(first?.contractCount, 5);
  assert.equal(second?.quality, 'REGULAR');
  assert.equal(second?.contractStatus, 'NEGOTIATING');
  assert.equal(second?.negotiationCount, 7);
  assert.deepEqual(second?.problems.sort(), ['NO_PROFILE', 'NO_RESPONSE'].sort());
  db.close();
});

test('quantidade de contratos é obrigatória somente quando resposta é Sim', () => {
  const db = freshDb();
  const { report } = createSingleThesisScenario(db);
  assert.throws(
    () => submitReportFeedback(db, report.token, { answers: [validDraft(report.metrics[0], { contractStatus: 'YES', contractCount: null })] }),
    ValidationError
  );
  const updated = submitReportFeedback(db, report.token, { answers: [validDraft(report.metrics[0], { contractStatus: 'NO', contractCount: null, negotiationCount: 9 })] });
  assert.equal(updated.feedbacks[0].contractCount, null);
  assert.equal(updated.feedbacks[0].negotiationCount, null);
  db.close();
});

test('Todos ignora a quantidade exata de atendidos e persiste ausência de quantidade', () => {
  const db = freshDb();
  const { report } = createSingleThesisScenario(db);
  const updated = submitReportFeedback(db, report.token, {
    answers: [validDraft(report.metrics[0], { attendance: 'ALL', attendanceCount: report.metrics[0].leads })]
  });
  assert.equal(updated.feedbacks[0].attendance, 'ALL');
  assert.equal(updated.feedbacks[0].attendanceCount, null);
  db.close();
});

test('leads em negociação exigem inteiro entre zero e a quantidade de leads e são persistidos', () => {
  const dbMissing = freshDb();
  const { report: missingReport } = createSingleThesisScenario(dbMissing);
  assert.throws(
    () => submitReportFeedback(dbMissing, missingReport.token, {
      answers: [validDraft(missingReport.metrics[0], { contractStatus: 'NEGOTIATING', contractCount: null, negotiationCount: null })]
    }),
    ValidationError
  );
  dbMissing.close();

  const dbNegative = freshDb();
  const { report: negativeReport } = createSingleThesisScenario(dbNegative);
  assert.throws(
    () => submitReportFeedback(dbNegative, negativeReport.token, {
      answers: [validDraft(negativeReport.metrics[0], { contractStatus: 'NEGOTIATING', contractCount: null, negotiationCount: -1 })]
    }),
    ValidationError
  );
  dbNegative.close();

  const dbFraction = freshDb();
  const { report: fractionReport } = createSingleThesisScenario(dbFraction);
  assert.throws(
    () => submitReportFeedback(dbFraction, fractionReport.token, {
      answers: [validDraft(fractionReport.metrics[0], { contractStatus: 'NEGOTIATING', contractCount: null, negotiationCount: 2.5 })]
    }),
    ValidationError
  );
  dbFraction.close();

  const db = freshDb();
  const { report } = createSingleThesisScenario(db);
  const updated = submitReportFeedback(db, report.token, {
    answers: [validDraft(report.metrics[0], { contractStatus: 'NEGOTIATING', contractCount: null, negotiationCount: 0 })]
  });
  assert.equal(updated.feedbacks[0].contractCount, null);
  assert.equal(updated.feedbacks[0].negotiationCount, 0);
  db.close();
});

test('Nenhum problema relevante é exclusivo e múltiplos problemas normais são aceitos', () => {
  const db = freshDb();
  const { report } = createSingleThesisScenario(db);
  assert.throws(
    () => submitReportFeedback(db, report.token, { answers: [validDraft(report.metrics[0], { problems: ['NONE', 'NO_RESPONSE'] })] }),
    ValidationError
  );
  const db2 = freshDb();
  const { report: report2 } = createSingleThesisScenario(db2);
  const updated = submitReportFeedback(db2, report2.token, { answers: [validDraft(report2.metrics[0], { problems: ['NO_RESPONSE', 'NO_INTEREST'] })] });
  assert.deepEqual(updated.feedbacks[0].problems.sort(), ['NO_INTEREST', 'NO_RESPONSE'].sort());
  db.close();
  db2.close();
});

test('filtros retornam relatórios coerentes por cliente, tese e status', () => {
  const db = freshDb();
  const { client, report } = createTwoThesisScenario(db);
  submitReportFeedback(db, report.token, { answers: report.metrics.map((metric) => validDraft(metric, { contractStatus: 'NO', contractCount: null })) });
  const filtered = getDashboard(db, { clientCode: client.code, thesisSlug: 'bpc-transtornos-mentais', status: 'RESPONDED' });
  assert.equal(filtered.reports.length, 1);
  assert.equal(filtered.reports[0].clientCode, client.code);
  assert.equal(filtered.reports[0].status, 'RESPONDED');
  assert.equal(filtered.reports[0].metrics.length, 1);
  assert.equal(filtered.reports[0].metrics[0].thesisSlug, 'bpc-transtornos-mentais');
  db.close();
});

test('contadores gerais incluem relatórios respondidos mesmo quando o período mais recente está pendente', () => {
  const db = freshDb();
  const { client, report } = createSingleThesisScenario(db);
  submitReportFeedback(db, report.token, { answers: [validDraft(report.metrics[0], { contractCount: 3 })] });
  createReport(db, {
    clientCode: client.code,
    periodStart: '2026-09-07',
    periodEnd: '2026-09-13',
    metrics: [{ thesisSlug: 'salario-maternidade', investmentCents: 120000, leads: 48, cpcCents: 260 }]
  });
  const dashboard = getDashboard(db);
  assert.equal(dashboard.kpis.reportsTotal, 2);
  assert.equal(dashboard.kpis.respondedReports, 1);
  assert.equal(dashboard.kpis.awaitingReports, 1);
  assert.equal(dashboard.kpis.responseRate, 50);
  assert.equal(dashboard.kpis.contractsReported, 3);
  db.close();
});

test('contratos totais preservam a soma exata das teses respondidas', () => {
  const db = freshDb();
  const { report } = createTwoThesisScenario(db);
  submitReportFeedback(db, report.token, {
    answers: [
      validDraft(report.metrics[0], { contractCount: 5 }),
      validDraft(report.metrics[1], { contractCount: 4 })
    ]
  });
  const dashboard = getDashboard(db);
  assert.equal(dashboard.kpis.contractsReported, 9);
  assert.equal(dashboard.reports[0].feedbacks.reduce((sum, feedback) => sum + (feedback.contractCount ?? 0), 0), 9);
  db.close();
});


test('progresso inclui a etapa de correção para uma, duas e três teses', () => {
  assert.deepEqual(calculateReportProgress(1, 0, false), { currentStep: 1, totalSteps: 2, percent: 50 });
  assert.deepEqual(calculateReportProgress(1, 0, true), { currentStep: 2, totalSteps: 2, percent: 100 });

  assert.deepEqual(calculateReportProgress(2, 0, false), { currentStep: 1, totalSteps: 3, percent: 33 });
  assert.deepEqual(calculateReportProgress(2, 1, false), { currentStep: 2, totalSteps: 3, percent: 67 });
  assert.deepEqual(calculateReportProgress(2, 1, true), { currentStep: 3, totalSteps: 3, percent: 100 });

  assert.deepEqual(calculateReportProgress(3, 0, false), { currentStep: 1, totalSteps: 4, percent: 25 });
  assert.deepEqual(calculateReportProgress(3, 1, false), { currentStep: 2, totalSteps: 4, percent: 50 });
  assert.deepEqual(calculateReportProgress(3, 2, false), { currentStep: 3, totalSteps: 4, percent: 75 });
  assert.deepEqual(calculateReportProgress(3, 2, true), { currentStep: 4, totalSteps: 4, percent: 100 });
});

test('notificações de espera e atraso são persistidas sem duplicidade e mantêm estado de leitura', () => {
  const db = freshDb();
  const client = createClient(db, { name: 'Cliente Notificação', thesisSlugs: ['salario-maternidade'] });
  const report = createReport(db, {
    clientCode: client.code,
    periodStart: '2026-09-07',
    periodEnd: '2026-09-13',
    metrics: [{ thesisSlug: 'salario-maternidade', investmentCents: 100000, leads: 20, cpcCents: 250 }]
  });
  db.prepare('UPDATE reports SET sent_at = ? WHERE id = ?').run('2026-09-08T12:00:00.000Z', report.id);

  const dayTwo = listNotifications(db, 30, new Date('2026-09-10T15:00:00.000Z'));
  assert.equal(dayTwo.notifications.length, 1);
  assert.equal(dayTwo.notifications[0]?.type, 'REPORT_WAITING');
  assert.match(dayTwo.notifications[0]?.message ?? '', /2 dias/);
  assert.equal(dayTwo.unreadCount, 1);

  const sameDay = listNotifications(db, 30, new Date('2026-09-10T20:00:00.000Z'));
  assert.equal(sameDay.notifications.length, 1, 'recarregar no mesmo dia não deve duplicar a notificação');

  const dayThree = listNotifications(db, 30, new Date('2026-09-11T15:00:00.000Z'));
  assert.equal(dayThree.notifications.length, 2);
  assert.match(dayThree.notifications[0]?.message ?? '', /3 dias/);

  assert.equal(markNotificationRead(db, dayThree.notifications[0].id, new Date('2026-09-11T16:00:00.000Z')), true);
  assert.equal(listNotifications(db, 30, new Date('2026-09-11T17:00:00.000Z')).unreadCount, 1);
  assert.equal(markAllNotificationsRead(db, new Date('2026-09-11T18:00:00.000Z')), 1);
  assert.equal(listNotifications(db, 30, new Date('2026-09-11T19:00:00.000Z')).unreadCount, 0);

  const late = listNotifications(db, 30, new Date('2026-09-14T15:00:00.000Z'));
  assert.equal(late.notifications.filter((item) => item.type === 'REPORT_LATE').length, 1);
  const lateAgain = listNotifications(db, 30, new Date('2026-09-14T20:00:00.000Z'));
  assert.equal(lateAgain.notifications.filter((item) => item.type === 'REPORT_LATE').length, 1);
  db.close();
});

test('resposta do cliente gera uma única notificação de relatório respondido', () => {
  const db = freshDb();
  const { report } = createSingleThesisScenario(db);
  submitReportFeedback(db, report.token, { answers: [validDraft(report.metrics[0])] });
  const notifications = listNotifications(db);
  assert.equal(notifications.notifications.filter((item) => item.type === 'REPORT_RESPONDED').length, 1);
  assert.match(notifications.notifications.find((item) => item.type === 'REPORT_RESPONDED')?.message ?? '', /respondeu o relatório/);
  assert.throws(() => submitReportFeedback(db, report.token, { answers: [validDraft(report.metrics[0])] }), ConflictError);
  assert.equal(listNotifications(db).notifications.filter((item) => item.type === 'REPORT_RESPONDED').length, 1);
  db.close();
});

import {
  authenticateAdmin,
  createAdminSession,
  createInitialAdmin,
  getAdminSession,
  hasAdminUser,
  revokeAdminSession
} from '../dist/auth.js';
import { buildReportsXlsx, exportFilename } from '../dist/xlsx.js';
import { inflateRawSync } from 'node:zlib';
import { listExports, recordExport } from '../dist/db.js';

test('credencial interna é armazenada de forma verificável e sessão pode ser revogada', () => {
  const db = freshDb();
  assert.equal(hasAdminUser(db), false);
  const user = createInitialAdmin(db, { name: 'Maurício', email: 'mauricio@mnmarketing.com.br', password: 'SenhaInterna2026!' });
  assert.equal(hasAdminUser(db), true);
  assert.equal(authenticateAdmin(db, 'mauricio@mnmarketing.com.br', 'senha-errada'), null);
  assert.equal(authenticateAdmin(db, 'outro@mnmarketing.com.br', 'SenhaInterna2026!'), null);
  assert.equal(authenticateAdmin(db, 'MAURICIO@MNMARKETING.COM.BR', 'SenhaInterna2026!')?.id, user.id);
  const created = createAdminSession(db, user);
  assert.equal(getAdminSession(db, created.token)?.user.name, 'Maurício');
  revokeAdminSession(db, created.token);
  assert.equal(getAdminSession(db, created.token), null);
  db.close();
});


function zipEntryText(bytes, targetName) {
  const buffer = Buffer.from(bytes);
  let offset = 0;
  while (offset + 30 <= buffer.length && buffer.readUInt32LE(offset) === 0x04034b50) {
    const method = buffer.readUInt16LE(offset + 8);
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const nameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const name = buffer.subarray(nameStart, nameStart + nameLength).toString('utf8');
    const dataStart = nameStart + nameLength + extraLength;
    const compressed = buffer.subarray(dataStart, dataStart + compressedSize);
    if (name === targetName) {
      const content = method === 8 ? inflateRawSync(compressed) : compressed;
      return content.toString('utf8');
    }
    offset = dataStart + compressedSize;
  }
  throw new Error(`Entrada ZIP não encontrada: ${targetName}`);
}

test('exportação XLSX gera arquivo Office válido e nome sanitizado', () => {
  const db = freshDb();
  const { report } = createSingleThesisScenario(db);
  const updated = submitReportFeedback(db, report.token, { answers: [validDraft(report.metrics[0], {
    contractStatus: 'NEGOTIATING', contractCount: null, negotiationCount: 6, otherProblem: '=HYPERLINK("malicioso")'
  })] });
  const bytes = buildReportsXlsx([updated]);
  assert.ok(bytes.byteLength > 3000);
  assert.equal(bytes[0], 0x50);
  assert.equal(bytes[1], 0x4b);
  for (const sheetName of ['sheet1.xml', 'sheet2.xml', 'sheet3.xml']) {
    const xml = zipEntryText(bytes, `xl/worksheets/${sheetName}`);
    assert.ok(xml.indexOf('<dimension') > 0);
    assert.ok(xml.indexOf('<dimension') < xml.indexOf('<sheetViews'), `${sheetName} deve declarar dimension antes de sheetViews`);
  }
  const responsesXml = zipEntryText(bytes, 'xl/worksheets/sheet3.xml');
  assert.match(responsesXml, /Leads em negociação/);
  assert.match(responsesXml, /<v>6<\/v>/);
  assert.match(responsesXml, /&apos;=HYPERLINK/);
  assert.match(exportFilename([updated]), /^MN_Insights_Cliente_Real_2026-08-31_2026-09-06\.xlsx$/);
  const log = recordExport(db, { scope: 'REPORT', clientCode: updated.clientCode, reportId: updated.id, filename: exportFilename([updated]), recordCount: 1, createdBy: 'Maurício' });
  assert.equal(log.reportId, updated.id);
  assert.equal(listExports(db)[0]?.filename, log.filename);
  db.close();
});
