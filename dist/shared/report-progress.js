export function calculateReportProgress(thesisCount, thesisStepIndex, reviewing) {
    const safeThesisCount = Math.max(1, Math.trunc(thesisCount));
    const totalSteps = safeThesisCount + 1;
    const currentThesisStep = Math.min(safeThesisCount, Math.max(1, Math.trunc(thesisStepIndex) + 1));
    const currentStep = reviewing ? totalSteps : currentThesisStep;
    const percent = Math.max(0, Math.min(100, Math.round((currentStep / totalSteps) * 100)));
    return { currentStep, totalSteps, percent };
}
//# sourceMappingURL=report-progress.js.map