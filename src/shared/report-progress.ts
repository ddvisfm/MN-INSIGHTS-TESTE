export interface ReportProgress {
  currentStep: number;
  totalSteps: number;
  percent: number;
}

export function calculateReportProgress(thesisCount: number, thesisStepIndex: number, reviewing: boolean): ReportProgress {
  const safeThesisCount = Math.max(1, Math.trunc(thesisCount));
  const totalSteps = safeThesisCount + 1;
  const currentThesisStep = Math.min(safeThesisCount, Math.max(1, Math.trunc(thesisStepIndex) + 1));
  const currentStep = reviewing ? totalSteps : currentThesisStep;
  const percent = Math.max(0, Math.min(100, Math.round((currentStep / totalSteps) * 100)));
  return { currentStep, totalSteps, percent };
}
