export const THESIS_SLUGS = [
  'salario-maternidade',
  'segundo-salario-maternidade',
  'bpc-transtornos-mentais',
  'bpc-pessoa-com-deficiencia',
  'bpc-tdah',
  'bpc-autismo',
  'beneficio-por-incapacidade',
  'auxilio-acidente',
  'aposentadoria-pcd',
  'aposentadoria-professor'
] as const;
export type ThesisSlug = (typeof THESIS_SLUGS)[number];

export const REPORT_STATUSES = ['AWAITING_FEEDBACK', 'RESPONDED'] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export const LEAD_ATTENDANCE_VALUES = ['FEW', 'HALF', 'MOST', 'ALL'] as const;
export type LeadAttendance = (typeof LEAD_ATTENDANCE_VALUES)[number];

export const LEAD_QUALITY_VALUES = ['POOR', 'REGULAR', 'GOOD', 'VERY_GOOD'] as const;
export type LeadQuality = (typeof LEAD_QUALITY_VALUES)[number];

export const CONTRACT_STATUS_VALUES = ['YES', 'NO', 'NEGOTIATING'] as const;
export type ContractStatus = (typeof CONTRACT_STATUS_VALUES)[number];

export const LEAD_PROBLEM_VALUES = [
  'NO_PROFILE',
  'NO_RESPONSE',
  'NO_INTEREST',
  'HAS_LAWYER',
  'OUTSIDE_REGION',
  'NONE',
  'OTHER'
] as const;
export type LeadProblem = (typeof LEAD_PROBLEM_VALUES)[number];

export interface ClientSummary {
  id: number;
  code: string;
  name: string;
  active: boolean;
  createdAt: string;
  theses: ThesisSummary[];
  latestReport?: ReportSummary;
}

export interface ThesisSummary {
  id: number;
  slug: ThesisSlug;
  name: string;
}

export interface Metrics {
  thesisId: number;
  thesisSlug: ThesisSlug;
  thesisName: string;
  investmentCents: number;
  leads: number;
  cplCents: number;
  cpcCents: number;
}

export interface Feedback {
  thesisId: number;
  thesisSlug: ThesisSlug;
  thesisName: string;
  attendance: LeadAttendance;
  attendanceCount: number | null;
  quality: LeadQuality;
  contractStatus: ContractStatus;
  contractCount: number | null;
  negotiationCount: number | null;
  problems: LeadProblem[];
  otherProblem: string | null;
  campaignObservation: string | null;
  agencyFeedback: string | null;
}

export interface ReportSummary {
  id: number;
  clientId: number;
  clientCode: string;
  clientName: string;
  periodStart: string;
  periodEnd: string;
  status: ReportStatus;
  token: string;
  sentAt: string;
  respondedAt: string | null;
  theses: ThesisSummary[];
  metrics: Metrics[];
  feedbacks: Feedback[];
}

export interface DashboardPayload {
  filters: {
    clientCode: string | null;
    thesisSlug: ThesisSlug | null;
    status: ReportStatus | null;
  };
  clients: ClientSummary[];
  theses: ThesisSummary[];
  reports: ReportSummary[];
  kpis: {
    activeClients: number;
    reportsInLatestPeriod: number;
    awaitingInLatestPeriod: number;
    respondedInLatestPeriod: number;
    contractsReported: number;
    negotiatingSignals: number;
    reportsTotal: number;
    awaitingReports: number;
    respondedReports: number;
    responseRate: number;
  };
  latestPeriod: { start: string; end: string } | null;
  cplHistory: Array<{ periodStart: string; periodEnd: string; thesisName: string; valueCents: number }>;
  leadsHistory: Array<{ periodStart: string; periodEnd: string; thesisName: string; leads: number }>;
  qualityDistribution: Array<{ quality: LeadQuality; count: number }>;
  problemDistribution: Array<{ problem: LeadProblem; count: number }>;
}

export interface ClientDetailPayload {
  client: ClientSummary;
  reports: ReportSummary[];
}

export interface PublicReportPayload {
  report: ReportSummary;
  blocked: boolean;
}

export interface FeedbackDraft {
  thesisId: number;
  attendance: LeadAttendance | '';
  attendanceCount: number | null;
  quality: LeadQuality | '';
  contractStatus: ContractStatus | '';
  contractCount: number | null;
  negotiationCount: number | null;
  problems: LeadProblem[];
  otherProblem: string;
  campaignObservation: string;
  agencyFeedback: string;
}

export interface SubmitFeedbackPayload {
  answers: FeedbackDraft[];
}

export interface CreateClientPayload {
  name: string;
  thesisSlugs: ThesisSlug[];
}

export interface CreateReportMetricPayload {
  thesisSlug: ThesisSlug;
  investmentCents: number;
  leads: number;
  cpcCents: number;
}

export interface CreateReportPayload {
  clientCode: string;
  periodStart: string;
  periodEnd: string;
  metrics: CreateReportMetricPayload[];
}

export interface ApiError {
  error: string;
  fieldErrors?: Record<string, string>;
}

export interface AdminUserSummary {
  id: number;
  name: string;
  role: 'INTERNAL';
}

export interface AuthSessionPayload {
  authenticated: boolean;
  needsSetup: boolean;
  user?: AdminUserSummary;
  csrfToken?: string;
}

export type NotificationType = 'REPORT_RESPONDED' | 'REPORT_WAITING' | 'REPORT_LATE';

export interface NotificationSummary {
  id: number;
  type: NotificationType;
  title: string;
  message: string;
  reportId: number;
  clientId: number;
  clientCode: string;
  clientName: string;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationsPayload {
  notifications: NotificationSummary[];
  unreadCount: number;
}

export interface ExportRecord {
  id: number;
  scope: 'REPORT' | 'GENERAL';
  clientCode: string | null;
  reportId: number | null;
  filename: string;
  recordCount: number;
  createdAt: string;
  createdBy: string;
}
