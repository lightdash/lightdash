import {
    type OnboardingConnectionInventory,
    type OnboardingConnectionValues,
    type OnboardingConnectionValueSource,
    type OnboardingConnectionValueSources,
    type OnboardingInventoryDatabase,
    type OnboardingInventoryRole,
    type OnboardingInventoryWarehouse,
    type OnboardingSchemaSummary,
} from '@lightdash/common';
import {
    type ComboboxData,
    type ComboboxItem,
    type ComboboxItemGroup,
} from '@mantine-8/core';

const ADMIN_ROLES = ['ACCOUNTADMIN', 'SECURITYADMIN', 'ORGADMIN'];

export const isAdminRole = (role: string | null): boolean =>
    role !== null && ADMIN_ROLES.includes(role.trim().toUpperCase());

const SYSTEM_DATABASE_NAMES = ['SNOWFLAKE', 'SNOWFLAKE_SAMPLE_DATA'];
const IMPORTED_DATABASE_KIND = 'IMPORTED DATABASE';

const WAREHOUSE_SIZE_ORDER = [
    'X-Small',
    'Small',
    'Medium',
    'Large',
    'X-Large',
    '2X-Large',
    '3X-Large',
    '4X-Large',
    '5X-Large',
    '6X-Large',
];

const asRecord = (value: unknown): Record<string, unknown> | null =>
    value && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : null;

const asString = (value: unknown): string | null =>
    typeof value === 'string' ? value : null;

const normalizeDatabase = (
    raw: unknown,
): OnboardingInventoryDatabase | null => {
    if (typeof raw === 'string') {
        return { name: raw, comment: null, kind: null };
    }
    const record = asRecord(raw);
    if (!record || typeof record.name !== 'string') return null;
    return {
        name: record.name,
        comment: asString(record.comment),
        kind: asString(record.kind),
    };
};

const normalizeWarehouse = (
    raw: unknown,
): OnboardingInventoryWarehouse | null => {
    if (typeof raw === 'string') {
        return { name: raw, size: null, state: null, autoSuspendSeconds: null };
    }
    const record = asRecord(raw);
    if (!record || typeof record.name !== 'string') return null;
    return {
        name: record.name,
        size: asString(record.size),
        state: asString(record.state),
        autoSuspendSeconds:
            typeof record.autoSuspendSeconds === 'number'
                ? record.autoSuspendSeconds
                : null,
    };
};

const normalizeRole = (raw: unknown): OnboardingInventoryRole | null => {
    if (typeof raw === 'string') {
        return { name: raw, isDefault: false };
    }
    const record = asRecord(raw);
    if (!record || typeof record.name !== 'string') return null;
    return { name: record.name, isDefault: record.isDefault === true };
};

export const normalizeInventory = (
    raw: unknown,
): OnboardingConnectionInventory | null => {
    const record = asRecord(raw);
    if (!record) return null;
    const databases = Array.isArray(record.databases)
        ? record.databases
              .map(normalizeDatabase)
              .filter((d): d is OnboardingInventoryDatabase => d !== null)
        : [];
    const warehouses = Array.isArray(record.warehouses)
        ? record.warehouses
              .map(normalizeWarehouse)
              .filter((w): w is OnboardingInventoryWarehouse => w !== null)
        : [];
    const roles = Array.isArray(record.roles)
        ? record.roles
              .map(normalizeRole)
              .filter((r): r is OnboardingInventoryRole => r !== null)
        : [];
    return { databases, warehouses, roles };
};

const VALUE_SOURCES: OnboardingConnectionValueSource[] = [
    'flag',
    'default',
    'missing',
    'user',
];

const parseSource = (value: unknown): OnboardingConnectionValueSource =>
    typeof value === 'string' && (VALUE_SOURCES as string[]).includes(value)
        ? (value as OnboardingConnectionValueSource)
        : 'missing';

const parseValues = (raw: unknown): OnboardingConnectionValues => {
    const record = asRecord(raw) ?? {};
    return {
        database: asString(record.database),
        warehouse: asString(record.warehouse),
        role: asString(record.role),
        schema: asString(record.schema),
    };
};

const parseSources = (
    raw: unknown,
): OnboardingConnectionValueSources | null => {
    const record = asRecord(raw);
    if (!record) return null;
    return {
        database: parseSource(record.database),
        warehouse: parseSource(record.warehouse),
        role: parseSource(record.role),
        schema: parseSource(record.schema),
    };
};

export type ParsedConnectResult = {
    inventory: OnboardingConnectionInventory;
    connectionValues: OnboardingConnectionValues;
    connectionValueSources: OnboardingConnectionValueSources | null;
};

export const parseConnectStepResult = (
    result: Record<string, unknown> | null,
): ParsedConnectResult | null => {
    if (!result) return null;
    const inventory = normalizeInventory(result.inventory);
    if (!inventory) return null;
    return {
        inventory,
        connectionValues: parseValues(result.connectionValues),
        connectionValueSources: parseSources(result.connectionValueSources),
    };
};

export type DatabaseGroupKind = 'normal' | 'shared' | 'system';

export const databaseGroup = (
    database: OnboardingInventoryDatabase,
): DatabaseGroupKind => {
    if (SYSTEM_DATABASE_NAMES.includes(database.name.trim().toUpperCase())) {
        return 'system';
    }
    if ((database.kind ?? '').trim().toUpperCase() === IMPORTED_DATABASE_KIND) {
        return 'shared';
    }
    return 'normal';
};

export const buildDatabaseSelectData = (
    databases: OnboardingInventoryDatabase[],
): ComboboxData => {
    const byName = (
        a: OnboardingInventoryDatabase,
        b: OnboardingInventoryDatabase,
    ) => a.name.localeCompare(b.name);
    const inGroup = (kind: DatabaseGroupKind) =>
        databases.filter((d) => databaseGroup(d) === kind).sort(byName);
    const toItem = (d: OnboardingInventoryDatabase): ComboboxItem => ({
        value: d.name,
        label: d.name,
    });

    const normal = inGroup('normal');
    const shared = inGroup('shared');
    const system = inGroup('system');

    const data: (ComboboxItem | ComboboxItemGroup)[] = [...normal.map(toItem)];
    if (shared.length > 0) {
        data.push({ group: 'Shared with you', items: shared.map(toItem) });
    }
    if (system.length > 0) {
        data.push({ group: 'System', items: system.map(toItem) });
    }
    return data;
};

const sizeRank = (size: string | null): number => {
    if (!size) return Number.MAX_SAFE_INTEGER;
    const index = WAREHOUSE_SIZE_ORDER.findIndex(
        (candidate) => candidate.toLowerCase() === size.trim().toLowerCase(),
    );
    return index === -1 ? Number.MAX_SAFE_INTEGER : index;
};

const isStarted = (state: string | null): boolean =>
    (state ?? '').trim().toUpperCase() === 'STARTED';

export const recommendedWarehouseName = (
    warehouses: OnboardingInventoryWarehouse[],
): string | null => {
    let best: OnboardingInventoryWarehouse | null = null;
    warehouses.forEach((warehouse) => {
        if (best === null) {
            best = warehouse;
            return;
        }
        const candidateRank = sizeRank(warehouse.size);
        const bestRank = sizeRank(best.size);
        if (candidateRank < bestRank) {
            best = warehouse;
        } else if (
            candidateRank === bestRank &&
            isStarted(warehouse.state) &&
            !isStarted(best.state)
        ) {
            best = warehouse;
        }
    });
    return best === null ? null : (best as OnboardingInventoryWarehouse).name;
};

export const warehouseSecondaryText = (
    warehouse: OnboardingInventoryWarehouse,
): string | null => {
    const parts: string[] = [];
    if (warehouse.size) parts.push(warehouse.size);
    if (warehouse.state) parts.push(warehouse.state.toLowerCase());
    return parts.length > 0 ? parts.join(' · ') : null;
};

export const largestSchemaName = (
    schemas: OnboardingSchemaSummary[],
): string | null => {
    if (schemas.length === 0) return null;
    return schemas.reduce(
        (best, schema) => (schema.tableCount > best.tableCount ? schema : best),
        schemas[0],
    ).name;
};

export const schemaTotals = (
    schemas: OnboardingSchemaSummary[],
): { schemaCount: number; tableCount: number } => ({
    schemaCount: schemas.length,
    tableCount: schemas.reduce((total, schema) => total + schema.tableCount, 0),
});

export const defaultValueName = (
    values: OnboardingConnectionValues,
    sources: OnboardingConnectionValueSources | null,
    field: 'database' | 'warehouse' | 'role',
): string | null => {
    if (!sources) return null;
    return sources[field] === 'default' ? values[field] : null;
};

export type ConfigureSelections = {
    database: string | null;
    warehouse: string | null;
    role: string | null;
    schema: string | null;
};

export const initialSelections = (
    values: OnboardingConnectionValues,
    inventory: OnboardingConnectionInventory,
): ConfigureSelections => ({
    database: values.database,
    warehouse:
        values.warehouse ?? recommendedWarehouseName(inventory.warehouses),
    role: values.role && !isAdminRole(values.role) ? values.role : null,
    schema: values.schema,
});
