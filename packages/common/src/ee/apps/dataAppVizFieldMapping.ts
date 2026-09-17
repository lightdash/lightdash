/** A viz field can bind one query column or an ordered collection of columns. */
export type DataAppVizFieldMappingValue = string | string[];

/** Maps a data app viz's field name to its bound query field ids. */
export type DataAppVizFieldMapping = Record<
    string,
    DataAppVizFieldMappingValue
>;

/**
 * Normalizes a field binding for consumers that can operate on one or many
 * query columns. Missing bindings are empty; scalar legacy bindings stay first.
 */
export const getDataAppVizFieldIds = (
    value: DataAppVizFieldMappingValue | undefined,
): string[] =>
    typeof value === 'string' ? [value] : [...new Set(value ?? [])];
