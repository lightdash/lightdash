export type SchemaColumn = {
    tableName: string;
    columnName: string;
};

export type ColumnNameAllowListEntry = {
    column: string;
    reason: string;
};

export type ReusedColumnName = {
    tableName: string;
    columnName: string;
    existingTables: string[];
};

const MINIMUM_REASON_LENGTH = 24;

export const parseAllowList = (json: string): ColumnNameAllowListEntry[] => {
    const entries: unknown = JSON.parse(json);
    if (!Array.isArray(entries)) {
        throw new Error('The column name allow-list must be a JSON array');
    }
    return entries.map((entry: Partial<ColumnNameAllowListEntry>) => {
        const column = String(entry.column ?? '');
        const reason = String(entry.reason ?? '').trim();
        if (!/^[a-z0-9_]+\.[a-z0-9_]+$/.test(column)) {
            throw new Error(`${column} must be written as table.column`);
        }
        if (
            reason.length < MINIMUM_REASON_LENGTH ||
            reason.split(/\s+/).length < 2
        ) {
            throw new Error(
                `${column} needs a reason that says why the reused name is safe`,
            );
        }
        return { column, reason };
    });
};

const toKey = ({ tableName, columnName }: SchemaColumn) =>
    `${tableName}.${columnName}`;

export const findReusedColumnNames = ({
    baseColumns,
    headColumns,
    allowList,
}: {
    baseColumns: SchemaColumn[];
    headColumns: SchemaColumn[];
    allowList: ColumnNameAllowListEntry[];
}): ReusedColumnName[] => {
    const baseKeys = new Set(baseColumns.map(toKey));
    const baseTables = new Set(baseColumns.map(({ tableName }) => tableName));
    const allowed = new Set(allowList.map(({ column }) => column));
    const baseTablesByColumnName = baseColumns.reduce<Map<string, string[]>>(
        (tablesByName, { tableName, columnName }) =>
            tablesByName.set(columnName, [
                ...(tablesByName.get(columnName) ?? []),
                tableName,
            ]),
        new Map(),
    );

    return headColumns
        .filter(
            (column) =>
                baseTables.has(column.tableName) &&
                !baseKeys.has(toKey(column)) &&
                !allowed.has(toKey(column)),
        )
        .flatMap(({ tableName, columnName }) => {
            const existingTables = baseTablesByColumnName.get(columnName);
            return existingTables
                ? [
                      {
                          tableName,
                          columnName,
                          existingTables: [...existingTables].sort(),
                      },
                  ]
                : [];
        })
        .sort((left, right) => toKey(left).localeCompare(toKey(right)));
};
