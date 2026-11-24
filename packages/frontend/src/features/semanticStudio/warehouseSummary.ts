import { type WarehouseTablesCatalog } from '@lightdash/common';
import { useProject } from '../../hooks/useProject';
import { useTables } from '../sqlRunner/hooks/useTables';
import { STUDIO_STARTERS } from './studioStarters';

export type WarehouseTable = {
    schema: string;
    name: string;
    /** What a prompt names it by: schema-qualified, so it is unambiguous. */
    reference: string;
};

export type WarehouseSummary = {
    /** The catalog and schema the tables are in, when they share one; null across several. */
    location: string | null;
    tableCount: number;
    tables: WarehouseTable[];
};

export const summarizeWarehouseCatalog = (
    catalog: WarehouseTablesCatalog,
): WarehouseSummary => {
    const schemas = Object.entries(catalog).flatMap(([database, byName]) =>
        Object.entries(byName).map(([schema, tables]) => ({
            database,
            schema,
            tables: Object.keys(tables),
        })),
    );
    const databases = new Set(schemas.map(({ database }) => database));
    const location =
        schemas.length === 1
            ? `${schemas[0].database}.${schemas[0].schema}`
            : databases.size === 1
              ? [...databases][0]
              : null;
    const tables = schemas.flatMap(({ schema, tables: names }) =>
        names.map((name) => ({ schema, name, reference: `${schema}.${name}` })),
    );
    return { location, tableCount: tables.length, tables };
};

export const modelTablePrompt = (table: WarehouseTable) =>
    `Turn ${table.reference} into a model with its column descriptions.`;

/** Starters that name real tables when the catalog lists some, so the first ask fits this warehouse. */
export const getStudioStarters = (
    summary: WarehouseSummary | null,
): { label: string; prompt: string }[] => {
    const tables = summary?.tables.slice(0, 2) ?? [];
    if (tables.length === 0) return STUDIO_STARTERS;
    const [explore, , metrics] = STUDIO_STARTERS;
    return [
        explore,
        ...tables.map((table) => ({
            label: `Model ${table.name}`,
            prompt: modelTablePrompt(table),
        })),
        metrics,
    ];
};

/** The project's warehouse and what its catalog lists; summary is null until listed or when listing fails. */
export const useWarehouseSummary = (projectUuid: string) => {
    const { data: project } = useProject(projectUuid);
    const { data: catalog } = useTables({ projectUuid });
    return {
        type: project?.warehouseConnection?.type ?? null,
        summary: catalog ? summarizeWarehouseCatalog(catalog) : null,
    };
};
