import {
    getTableListingFailure,
    type WarehouseTablesCatalog,
} from '@lightdash/common';
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

/** Where the warehouse's tables are and how many, once listed. */
export const warehouseDetails = (summary: WarehouseSummary | null): string[] =>
    [
        summary?.location ?? null,
        !summary
            ? null
            : summary.tableCount === 0
              ? 'No tables this connection can see'
              : `${summary.tableCount} ${summary.tableCount === 1 ? 'table' : 'tables'}`,
    ].filter((detail) => detail !== null);

export const modelTablePrompt = (table: WarehouseTable) =>
    `Turn ${table.reference} into a model with its column descriptions.`;

/** With tables listed, the rail card offers modelling them, so the starters keep only the two open asks. */
export const getStudioStarters = (
    summary: WarehouseSummary | null,
): { label: string; prompt: string }[] => {
    if (!summary || summary.tables.length === 0) return STUDIO_STARTERS;
    const [explore, , metrics] = STUDIO_STARTERS;
    return [explore, metrics];
};

/** The project's warehouse and what its catalog lists; summary is null until listed or when listing fails, and listingFailure says why it failed. */
export const useWarehouseSummary = (projectUuid: string) => {
    const { data: project } = useProject(projectUuid);
    const { data: catalog, error, isLoading } = useTables({ projectUuid });
    return {
        type: project?.warehouseConnection?.type ?? null,
        isListing: isLoading,
        summary: catalog ? summarizeWarehouseCatalog(catalog) : null,
        listingFailure: error ? getTableListingFailure(error.error) : null,
    };
};
