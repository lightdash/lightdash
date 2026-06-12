/**
 * Field-level diff between a preview project and the project it was copied from
 * (`upstreamProjectUuid`), computed in SQL over the `catalog_search` index.
 *
 * Detects added/removed fields and label changes. It does not detect SQL-only
 * changes (same name/label, different SQL) — that would require walking the
 * cached explore definitions, which is too expensive to do per request.
 */

export type UpstreamFieldChangeKind = 'added' | 'removed' | 'label_changed';

export type UpstreamFieldDiff = {
    change: UpstreamFieldChangeKind;
    exploreName: string;
    tableName: string;
    fieldName: string;
    fieldType: string | null;
    upstreamLabel: string | null;
    previewLabel: string | null;
};

export type ApiUpstreamDiffResults = {
    upstreamProjectUuid: string;
    fields: UpstreamFieldDiff[];
};

export type ApiUpstreamDiffResponse = {
    status: 'ok';
    results: ApiUpstreamDiffResults;
};
