import type {
    TdcpCapabilities,
    TdcpCatalog,
    TdcpColumnSchema,
    TdcpDataLink,
    TdcpDataResult,
    TdcpDatasetDescriptor,
    TdcpDescribedTable,
    TdcpDialectDeclaration,
    TdcpLogicalType,
    TdcpPendingDataset,
} from './types';

/**
 * Structural validation at the wire boundary, so neither the client nor a
 * host ever trusts a cast. Deliberately shallow where nesting is deep —
 * the JSON Schema file is the exhaustive contract and the conformance
 * suite's job.
 */

export const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const LOGICAL_TYPES: readonly TdcpLogicalType[] = [
    'string',
    'number',
    'timestamp',
    'date',
    'boolean',
];

const isLogicalType = (value: unknown): value is TdcpLogicalType =>
    typeof value === 'string' &&
    (LOGICAL_TYPES as readonly string[]).includes(value);

const isColumnSchema = (value: unknown): value is TdcpColumnSchema =>
    isRecord(value) &&
    typeof value.name === 'string' &&
    isLogicalType(value.type) &&
    (typeof value.sourceType === 'string' || value.sourceType === null) &&
    (typeof value.label === 'string' || value.label === null) &&
    (typeof value.description === 'string' || value.description === null);

const isDataLink = (value: unknown): value is TdcpDataLink =>
    isRecord(value) &&
    (value.encoding === 'jsonl' || value.encoding === 'arrow') &&
    typeof value.href === 'string' &&
    (typeof value.token === 'string' || value.token === null) &&
    typeof value.expiresAt === 'string';

export const isDatasetDescriptor = (
    value: unknown,
): value is TdcpDatasetDescriptor =>
    isRecord(value) &&
    value.status === 'ready' &&
    typeof value.datasetId === 'string' &&
    Array.isArray(value.schema) &&
    value.schema.every(isColumnSchema) &&
    (typeof value.rowCount === 'number' || value.rowCount === null) &&
    typeof value.producedAt === 'string' &&
    typeof value.expiresAt === 'string' &&
    isRecord(value.freshness) &&
    Array.isArray(value.links) &&
    value.links.every(isDataLink);

const isPendingDataset = (value: unknown): value is TdcpPendingDataset =>
    isRecord(value) &&
    value.status === 'pending' &&
    typeof value.datasetId === 'string' &&
    (typeof value.pollAfterMs === 'number' || value.pollAfterMs === null);

export const isDataResult = (value: unknown): value is TdcpDataResult =>
    isPendingDataset(value) || isDatasetDescriptor(value);

export const assertDataResult = (value: unknown): TdcpDataResult => {
    if (!isDataResult(value)) {
        throw new Error('Invalid TDCP data result');
    }
    return value;
};

const isCatalogTableShape = (
    table: unknown,
    columnsRule: (columns: unknown) => boolean,
): boolean =>
    isRecord(table) &&
    typeof table.reference === 'string' &&
    columnsRule(table.columns);

export const isCatalog = (value: unknown): value is TdcpCatalog =>
    isRecord(value) &&
    Array.isArray(value.tables) &&
    value.tables.every((table) =>
        isCatalogTableShape(
            table,
            (columns) =>
                columns === null ||
                (Array.isArray(columns) && columns.every(isColumnSchema)),
        ),
    ) &&
    (typeof value.nextCursor === 'string' || value.nextCursor === null);

export const assertCatalog = (value: unknown): TdcpCatalog => {
    if (!isCatalog(value)) {
        throw new Error('Invalid TDCP catalog');
    }
    return value;
};

export const isDescribedTable = (value: unknown): value is TdcpDescribedTable =>
    isCatalogTableShape(
        value,
        (columns) => Array.isArray(columns) && columns.every(isColumnSchema),
    );

export const assertDescribedTable = (value: unknown): TdcpDescribedTable => {
    if (!isDescribedTable(value)) {
        throw new Error('Invalid TDCP described table');
    }
    return value;
};

const isDialectDeclaration = (
    value: unknown,
): value is TdcpDialectDeclaration =>
    isRecord(value) &&
    typeof value.dialect === 'string' &&
    (value.form === 'text' || value.form === 'structured') &&
    (isRecord(value.payloadSchema) || value.payloadSchema === null) &&
    (typeof value.docsUrl === 'string' || value.docsUrl === null);

export const isCapabilities = (value: unknown): value is TdcpCapabilities =>
    isRecord(value) &&
    typeof value.revision === 'string' &&
    typeof value.read === 'boolean' &&
    typeof value.scan === 'boolean' &&
    Array.isArray(value.queryDialects) &&
    value.queryDialects.every(isDialectDeclaration) &&
    typeof value.compose === 'boolean' &&
    typeof value.describe === 'boolean';

export const assertCapabilities = (value: unknown): TdcpCapabilities => {
    if (!isCapabilities(value)) {
        throw new Error('Invalid TDCP capabilities');
    }
    return value;
};
