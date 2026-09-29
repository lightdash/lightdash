export type GoogleSheetsExtensionReportDraftOperator =
    | 'equals'
    | 'notEquals'
    | 'include'
    | 'startsWith'
    | 'isNull'
    | 'notNull'
    | 'greaterThan'
    | 'greaterThanOrEqual'
    | 'lessThan'
    | 'lessThanOrEqual';

export type GoogleSheetsExtensionReportDraftFilter = {
    fieldId: string;
    operator: GoogleSheetsExtensionReportDraftOperator;
    values: string[];
};

export type GoogleSheetsExtensionReportDraftSettings = {
    rows: string[];
    columns: string[];
    values: string[];
    filters: GoogleSheetsExtensionReportDraftFilter[];
    sorts: { fieldId: string; descending: boolean }[];
    limit: number;
    totals: { rows: boolean; columns: boolean };
    groupRows: boolean;
};

export type GenerateGoogleSheetsExtensionReportDraftRequest = {
    exploreName: string;
    prompt: string;
    current: GoogleSheetsExtensionReportDraftSettings;
    timezone: string;
    clarifications: { prompt: string; message: string }[];
    /** Filter settings stay in the client; these filters must remain unchanged. */
    protectedFilters: GoogleSheetsExtensionReportDraftFilter[];
};

export type GeneratedGoogleSheetsExtensionReportDraft = {
    status: 'ready' | 'clarification' | 'unsupported';
    message: string;
    report: GoogleSheetsExtensionReportDraftSettings | null;
};
