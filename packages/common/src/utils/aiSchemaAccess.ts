import { type AiIdentitySchemaRule } from '../types/aiIdentitySchemaRule';
import { type Explore } from '../types/explore';
import { expandAiIdentitySchemaRule } from './aiIdentitySchemaRule';
import assertUnreachable from './assertUnreachable';

export type AiSchemaAccess =
    | { type: 'unrestricted' }
    | { type: 'schemas'; schemas: string[] }
    | { type: 'rule'; rule: AiIdentitySchemaRule };

export const canAiReadSchema = (
    access: AiSchemaAccess,
    database: string,
    schema: string,
): boolean => {
    if (access.type !== 'unrestricted' && (!database || !schema)) return false;
    const qualified = `${database}.${schema}`;
    switch (access.type) {
        case 'unrestricted':
            return true;
        case 'schemas':
            return access.schemas.some(
                (name) => name.toUpperCase() === qualified.toUpperCase(),
            );
        case 'rule':
            return expandAiIdentitySchemaRule(access.rule, [
                qualified,
            ]).allowed.some(
                (name) => name.toUpperCase() === qualified.toUpperCase(),
            );
        default:
            return assertUnreachable(access, 'Unknown AI schema access');
    }
};

export const filterExploresForAi = (
    explores: Explore[],
    access: AiSchemaAccess,
): Explore[] => {
    if (access.type === 'unrestricted') return explores;
    return explores.flatMap((explore) => {
        const tables = Object.fromEntries(
            Object.entries(explore.tables).filter(([, table]) =>
                canAiReadSchema(access, table.database, table.schema),
            ),
        );
        let changed = true;
        while (changed) {
            changed = false;
            for (const join of explore.joinedTables) {
                if (
                    tables[join.table] &&
                    (join.tablesReferences ?? []).some((name) => !tables[name])
                ) {
                    delete tables[join.table];
                    changed = true;
                }
            }
        }
        if (!tables[explore.baseTable]) return [];
        const filteredTables = Object.fromEntries(
            Object.entries(tables).map(([name, table]) => [
                name,
                {
                    ...table,
                    dimensions: Object.fromEntries(
                        Object.entries(table.dimensions).filter(([, field]) =>
                            (field.tablesReferences ?? []).every(
                                (reference) => tables[reference] !== undefined,
                            ),
                        ),
                    ),
                    metrics: Object.fromEntries(
                        Object.entries(table.metrics).filter(([, field]) =>
                            (field.tablesReferences ?? []).every(
                                (reference) => tables[reference] !== undefined,
                            ),
                        ),
                    ),
                },
            ]),
        );
        return [
            {
                ...explore,
                tables: filteredTables,
                unfilteredTables: filteredTables,
                joinedTables: explore.joinedTables.filter(
                    (join) =>
                        tables[join.table] !== undefined &&
                        (join.tablesReferences ?? []).every(
                            (name) => tables[name] !== undefined,
                        ),
                ),
            },
        ];
    });
};

export const isAiContentVisible = (
    content: unknown,
    explores: Explore[],
): boolean => {
    const visibleNames = new Set(explores.map((explore) => explore.name));
    const references: string[] = [];
    const visit = (value: unknown): void => {
        if (Array.isArray(value)) {
            value.forEach(visit);
        } else if (value !== null && typeof value === 'object') {
            Object.entries(value).forEach(([key, child]) => {
                if (key === 'exploreName' && typeof child === 'string') {
                    references.push(child);
                } else {
                    visit(child);
                }
            });
        }
    };
    visit(content);
    return (
        references.length > 0 &&
        references.every((name) => visibleNames.has(name))
    );
};
