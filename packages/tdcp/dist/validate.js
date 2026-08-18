"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.assertCapabilities = exports.isCapabilities = exports.assertCatalog = exports.isCatalog = exports.assertDatasetDescriptor = exports.isDatasetDescriptor = void 0;
/**
 * Structural validation at the wire boundary, so neither the client nor a
 * host ever trusts a cast. Deliberately shallow where nesting is deep —
 * the JSON Schema file is the exhaustive contract and the conformance
 * suite's job.
 */
const isRecord = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);
const LOGICAL_TYPES = [
    'string',
    'number',
    'timestamp',
    'date',
    'boolean',
];
const isLogicalType = (value) => typeof value === 'string' &&
    LOGICAL_TYPES.includes(value);
const isColumnSchema = (value) => isRecord(value) &&
    typeof value.name === 'string' &&
    isLogicalType(value.type) &&
    (typeof value.label === 'string' || value.label === null) &&
    (typeof value.description === 'string' || value.description === null);
const isDataLink = (value) => isRecord(value) &&
    (value.encoding === 'jsonl' || value.encoding === 'arrow') &&
    typeof value.href === 'string' &&
    (typeof value.token === 'string' || value.token === null) &&
    typeof value.expiresAt === 'string';
const isDatasetDescriptor = (value) => isRecord(value) &&
    typeof value.datasetId === 'string' &&
    Array.isArray(value.schema) &&
    value.schema.every(isColumnSchema) &&
    (typeof value.rowCount === 'number' || value.rowCount === null) &&
    typeof value.producedAt === 'string' &&
    typeof value.expiresAt === 'string' &&
    isRecord(value.freshness) &&
    (value.links === null ||
        (Array.isArray(value.links) && value.links.every(isDataLink)));
exports.isDatasetDescriptor = isDatasetDescriptor;
const assertDatasetDescriptor = (value) => {
    if (!(0, exports.isDatasetDescriptor)(value)) {
        throw new Error('Invalid TDCP dataset descriptor');
    }
    return value;
};
exports.assertDatasetDescriptor = assertDatasetDescriptor;
const isCatalog = (value) => isRecord(value) &&
    Array.isArray(value.tables) &&
    value.tables.every((table) => isRecord(table) &&
        typeof table.reference === 'string' &&
        Array.isArray(table.columns) &&
        table.columns.every(isColumnSchema));
exports.isCatalog = isCatalog;
const assertCatalog = (value) => {
    if (!(0, exports.isCatalog)(value)) {
        throw new Error('Invalid TDCP catalog');
    }
    return value;
};
exports.assertCatalog = assertCatalog;
const isCapabilities = (value) => isRecord(value) &&
    typeof value.revision === 'string' &&
    typeof value.read === 'boolean' &&
    typeof value.scan === 'boolean' &&
    Array.isArray(value.queryDialects) &&
    value.queryDialects.every((dialect) => typeof dialect === 'string') &&
    typeof value.compose === 'boolean';
exports.isCapabilities = isCapabilities;
const assertCapabilities = (value) => {
    if (!(0, exports.isCapabilities)(value)) {
        throw new Error('Invalid TDCP capabilities');
    }
    return value;
};
exports.assertCapabilities = assertCapabilities;
//# sourceMappingURL=validate.js.map