import { useMemo } from 'react';
import { useExplores } from '../../hooks/useExplores';
import { useTables } from '../sqlRunner/hooks/useTables';
import { type SchemaTables } from '../sqlRunner/utils/tableRows';

// Reads schema.table off a quoted identifier; a subquery or a one-part name gives null
const baseTableReference = (sqlTable: string | undefined) => {
    if (!sqlTable || /[\s()]/.test(sqlTable)) return null;
    const parts = sqlTable.replace(/["`[\]]/g, '').split('.');
    return parts.length < 2 ? null : parts.slice(-2).join('.').toLowerCase();
};

/** The warehouse's tables split by whether a model reads them, matched on the model's base table and on its name when that is missing. */
export const useCatalogTables = (projectUuid: string) => {
    const { data: catalog, isLoading } = useTables({ projectUuid });
    const { data: explores } = useExplores(projectUuid, true);
    const split = useMemo(() => {
        const references = new Set<string>();
        // A model that doesn't say which table it reads is matched by its name
        const names = new Set<string>();
        (explores ?? []).forEach((explore) => {
            const reference = baseTableReference(explore.sqlTable);
            if (reference) references.add(reference);
            else names.add(explore.name.toLowerCase());
        });
        const isModelled = (schema: string | number, name: string) =>
            references.has(`${schema}.${name}`.toLowerCase()) ||
            names.has(name.toLowerCase());
        const all: SchemaTables[] = Object.entries(catalog ?? {}).flatMap(
            ([database, schemas]) =>
                Object.entries(schemas).map(([schema, schemaTables]) => ({
                    database,
                    schema,
                    tables: schemaTables,
                })),
        );
        return {
            isModelled,
            schemas: all,
            unmodelled: all
                .map((entry) => ({
                    ...entry,
                    tables: Object.fromEntries(
                        Object.entries(entry.tables).filter(
                            ([name]) => !isModelled(entry.schema, name),
                        ),
                    ),
                }))
                .filter((entry) => Object.keys(entry.tables).length > 0),
            // The schemas the models already read from open first: the next table to model is likeliest there
            modelledSchemas: new Set(
                all
                    .filter(({ schema, tables }) =>
                        Object.keys(tables).some((name) =>
                            isModelled(schema, name),
                        ),
                    )
                    .map(({ schema }) => schema),
            ),
            modelledNames: all.flatMap(({ schema, tables }) =>
                Object.keys(tables).filter((name) => isModelled(schema, name)),
            ),
            hasSeveralDatabases:
                new Set(all.map(({ database }) => database)).size > 1,
        };
    }, [catalog, explores]);
    return { catalog, isLoading, ...split };
};
