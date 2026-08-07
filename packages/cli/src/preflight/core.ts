import {
    analyzeActivity,
    analyzeLock,
    analyzeLockTimeouts,
    analyzeRowEstimate,
    analyzeSeqScans,
    analyzeUpgradeStrategy,
    analyzeWriteRates,
    buildReport,
    computeWriteRates,
    findRangeGaps,
    mergeFactsFiles,
    parseFactsFile,
    renderHuman,
    selectFacts,
    type ActivityRow,
    type PreflightReport as CommonPreflightReport,
    type FactsFile,
    type FactsRangeCoverage,
    type Finding,
    type LockRow,
    type MergedFactsFile,
    type MigrationFact,
    type Severity,
    type StatRow,
    type TableFact,
    type WriteRate,
} from '@lightdash/common';

export type PreflightVerdict = Severity;
export type PreflightSeverity = Severity;
export type PreflightTableFact = TableFact;
export type PreflightMigrationFact = MigrationFact;
export type PreflightFactsFile = FactsFile;
export type MergedPreflightFacts = MergedFactsFile;
export type PreflightRangeCoverage = FactsRangeCoverage;
export type PreflightFinding = Finding;
export type PreflightReport = CommonPreflightReport;
export type PreflightLockRow = LockRow;
export type PreflightStatRow = StatRow;
export type PreflightWriteRate = WriteRate;
export type PreflightActivityRow = ActivityRow;

export interface PreflightCore {
    parseFactsFile: typeof parseFactsFile;
    mergeFactsFiles: typeof mergeFactsFiles;
    findRangeGaps: typeof findRangeGaps;
    selectFacts: typeof selectFacts;
    analyzeLock: typeof analyzeLock;
    computeWriteRates: typeof computeWriteRates;
    analyzeWriteRates: typeof analyzeWriteRates;
    analyzeActivity: typeof analyzeActivity;
    analyzeLockTimeouts: typeof analyzeLockTimeouts;
    analyzeRowEstimate: typeof analyzeRowEstimate;
    analyzeSeqScans: typeof analyzeSeqScans;
    analyzeUpgradeStrategy: typeof analyzeUpgradeStrategy;
    buildReport: typeof buildReport;
    renderHuman: typeof renderHuman;
}

export const getPreflightCore = (): PreflightCore => ({
    parseFactsFile,
    mergeFactsFiles,
    findRangeGaps,
    selectFacts,
    analyzeLock,
    computeWriteRates,
    analyzeWriteRates,
    analyzeActivity,
    analyzeLockTimeouts,
    analyzeRowEstimate,
    analyzeSeqScans,
    analyzeUpgradeStrategy,
    buildReport,
    renderHuman,
});
