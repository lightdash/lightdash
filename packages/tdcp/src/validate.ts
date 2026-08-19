import type {
    TdcpCapabilities,
    TdcpCatalog,
    TdcpColumnSchema,
    TdcpDataLink,
    TdcpDatasetDescriptor,
    TdcpLogicalType,
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
    typeof value.datasetId === 'string' &&
    Array.isArray(value.schema) &&
    value.schema.every(isColumnSchema) &&
    (typeof value.rowCount === 'number' || value.rowCount === null) &&
    typeof value.producedAt === 'string' &&
    typeof value.expiresAt === 'string' &&
    isRecord(value.freshness) &&
    (value.links === null ||
        (Array.isArray(value.links) && value.links.every(isDataLink)));

export const assertDatasetDescriptor = (
    value: unknown,
): TdcpDatasetDescriptor => {
    if (!isDatasetDescriptor(value)) {
        throw new Error('Invalid TDCP dataset descriptor');
    }
    return value;
};

export const isCatalog = (value: unknown): value is TdcpCatalog =>
    isRecord(value) &&
    Array.isArray(value.tables) &&
    value.tables.every(
        (table) =>
            isRecord(table) &&
            typeof table.reference === 'string' &&
            Array.isArray(table.columns) &&
            table.columns.every(isColumnSchema),
    );

export const assertCatalog = (value: unknown): TdcpCatalog => {
    if (!isCatalog(value)) {
        throw new Error('Invalid TDCP catalog');
    }
    return value;
};

export const isCapabilities = (value: unknown): value is TdcpCapabilities =>
    isRecord(value) &&
    typeof value.revision === 'string' &&
    typeof value.read === 'boolean' &&
    typeof value.scan === 'boolean' &&
    Array.isArray(value.queryDialects) &&
    value.queryDialects.every((dialect) => typeof dialect === 'string') &&
    typeof value.compose === 'boolean';

export const assertCapabilities = (value: unknown): TdcpCapabilities => {
    if (!isCapabilities(value)) {
        throw new Error('Invalid TDCP capabilities');
    }
    return value;
};
