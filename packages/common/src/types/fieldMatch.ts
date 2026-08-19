import { type FilterAutocompleteValue } from './field';

export type FieldValueSearchResult<T = unknown> = {
    search: string;
    /** @deprecated Kept for API/MCP compatibility; prefer `resultsWithLabels`. */
    results: T[];
    resultsWithLabels?: FilterAutocompleteValue[];
    /** Guidance for tool consumers, e.g. when value suggestions are
     *  disabled for the field and an empty result is not meaningful. */
    note?: string;
    cached: boolean;
    refreshedAt: Date;
};
