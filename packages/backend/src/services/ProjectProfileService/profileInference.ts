import {
    DimensionType,
    friendlyName,
    type InferredEntity,
    type InferredRelationship,
    type ProfiledTable,
    type ProfileResult,
} from '@lightdash/common';

export const MAX_PROFILE_TABLES = 100;

const normalizeIdentifier = (value: string): string =>
    value
        .normalize('NFKC')
        .toLocaleLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, '_')
        .replace(/^_+|_+$/g, '');

const singularizeWord = (value: string): string => {
    const irregular: Record<string, string> = {
        children: 'child',
        men: 'man',
        people: 'person',
        women: 'woman',
    };
    if (irregular[value]) return irregular[value];
    if (value.endsWith('ies') && value.length > 3) {
        return `${value.slice(0, -3)}y`;
    }
    if (/(ches|shes|sses|uses|xes|zes)$/.test(value) && value.length > 2) {
        return value.slice(0, -2);
    }
    if (value.endsWith('s') && !value.endsWith('ss') && value.length > 1) {
        return value.slice(0, -1);
    }
    return value;
};

const singularizeIdentifier = (value: string): string => {
    const parts = normalizeIdentifier(value).split('_');
    const lastPart = parts.pop();
    if (!lastPart) return '';
    return [...parts, singularizeWord(lastPart)].join('_');
};

const isKeyType = (type: DimensionType): boolean =>
    type === DimensionType.NUMBER || type === DimensionType.STRING;

const getPrimaryKey = (table: ProfiledTable): string | null => {
    const normalizedTableName = normalizeIdentifier(table.name);
    const singularTableName = singularizeIdentifier(table.name);
    const candidates = [
        'id',
        `${singularTableName}_id`,
        `${normalizedTableName}_id`,
    ];

    for (const candidate of candidates) {
        const column = table.columns.find(
            ({ name, type }) =>
                normalizeIdentifier(name) === candidate && isKeyType(type),
        );
        if (column) return column.name;
    }
    return null;
};

const getEntityNotes = (
    table: ProfiledTable,
    primaryKey: string | null,
): string[] => {
    if (primaryKey) return [];
    const possibleKeyColumns = table.columns.filter(
        ({ name, type }) =>
            /_(id|key)$/.test(normalizeIdentifier(name)) && isKeyType(type),
    );
    return possibleKeyColumns.length > 1
        ? [
              'Low confidence: possible composite key detected; this table is not used as a relationship target.',
          ]
        : [];
};

const formatRowCount = (rowCount: number | null): string =>
    rowCount === null
        ? 'row count unavailable'
        : `${rowCount.toLocaleString('en-US')} rows`;

const isEntityTable = (table: ProfiledTable): boolean =>
    table.tableType !== 'view';

const inferEntity = (table: ProfiledTable): InferredEntity => {
    const label = friendlyName(table.name);
    const primaryKey = getPrimaryKey(table);
    return {
        database: table.database,
        schema: table.schema,
        tableName: table.name,
        label,
        description: `${label} — ${formatRowCount(table.rowCount)}${
            primaryKey ? `, identified by ${primaryKey}` : ''
        }`,
        rowCount: table.rowCount,
        columnCount: table.columns.length,
        primaryKey,
        notes: getEntityNotes(table, primaryKey),
    };
};

const inferEntities = (tables: ProfiledTable[]): InferredEntity[] =>
    tables.filter(isEntityTable).map(inferEntity);

type RelationshipTarget = {
    table: ProfiledTable;
    primaryKey: string;
    normalizedName: string;
    singularName: string;
    primaryKeyType: DimensionType;
};

const getRelationshipConfidence = (
    columnName: string,
    target: RelationshipTarget,
): 'high' | 'low' | null => {
    const normalizedColumn = normalizeIdentifier(columnName);
    let suffix: '_id' | '_key' | null = null;
    if (normalizedColumn.endsWith('_id')) {
        suffix = '_id';
    } else if (normalizedColumn.endsWith('_key')) {
        suffix = '_key';
    }
    if (!suffix) return null;

    const prefix = normalizedColumn.slice(0, -suffix.length);
    if (prefix === target.singularName && suffix === '_id') return 'high';
    if (
        prefix === target.normalizedName ||
        singularizeIdentifier(prefix) === target.singularName ||
        prefix.endsWith(`_${target.singularName}`)
    ) {
        return 'low';
    }
    return null;
};

const inferRelationships = (
    tables: ProfiledTable[],
    entityTables: ProfiledTable[],
): InferredRelationship[] => {
    const targets: RelationshipTarget[] = entityTables.flatMap((table) => {
        const primaryKey = getPrimaryKey(table);
        if (!primaryKey) return [];
        const primaryKeyColumn = table.columns.find(
            ({ name }) => name === primaryKey,
        );
        if (!primaryKeyColumn) return [];
        return [
            {
                table,
                primaryKey,
                normalizedName: normalizeIdentifier(table.name),
                singularName: singularizeIdentifier(table.name),
                primaryKeyType: primaryKeyColumn.type,
            },
        ];
    });

    return entityTables.flatMap((fromTable) =>
        fromTable.columns.flatMap((fromColumn) => {
            const candidates = targets
                .filter(
                    (target) =>
                        target.table !== fromTable &&
                        target.primaryKeyType === fromColumn.type,
                )
                .map((target) => ({
                    target,
                    confidence: getRelationshipConfidence(
                        fromColumn.name,
                        target,
                    ),
                }))
                .filter(
                    (
                        candidate,
                    ): candidate is {
                        target: RelationshipTarget;
                        confidence: 'high' | 'low';
                    } => candidate.confidence !== null,
                )
                .sort((left, right) => {
                    if (left.confidence !== right.confidence) {
                        return left.confidence === 'high' ? -1 : 1;
                    }
                    return left.target.table.name.localeCompare(
                        right.target.table.name,
                    );
                });
            const match = candidates[0];
            if (!match) return [];
            return [
                {
                    fromTable: fromTable.name,
                    fromColumn: fromColumn.name,
                    toTable: match.target.table.name,
                    toColumn: match.target.primaryKey,
                    type: 'many_to_one' as const,
                    confidence: match.confidence,
                },
            ];
        }),
    );
};

export const limitProfileTables = <T>(
    tables: T[],
    maxTables: number = MAX_PROFILE_TABLES,
): { tables: T[]; truncated: boolean } => ({
    tables: tables.slice(0, maxTables),
    truncated: tables.length > maxTables,
});

export const inferProfile = ({
    tables,
    truncated,
    profiledAt,
}: {
    tables: ProfiledTable[];
    truncated: boolean;
    profiledAt: string;
}): ProfileResult => {
    const entityTables = tables.filter(isEntityTable);
    const entities = inferEntities(tables);
    return {
        tables,
        entities,
        relationships: inferRelationships(tables, entityTables),
        truncated,
        profiledAt,
    };
};
