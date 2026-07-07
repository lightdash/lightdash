import { type FilterAutocompleteValue } from './field';

export type FieldValueSearchResult<T = unknown> = {
    search: string;
    /** @deprecated Kept for API/MCP compatibility; prefer `resultsWithLabels`. */
    results: T[];
    resultsWithLabels?: FilterAutocompleteValue[];
    cached: boolean;
    refreshedAt: Date;
};
