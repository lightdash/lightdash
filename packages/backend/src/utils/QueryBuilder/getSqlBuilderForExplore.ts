import {
    ExploreType,
    SupportedDbtAdapter,
    type CreateWarehouseCredentials,
    type Explore,
} from '@lightdash/common';
import { warehouseSqlBuilderFromType } from '@lightdash/warehouses';

/**
 * External source explores compile in the DuckDB dialect regardless of the
 * project warehouse: their tables are ingested files executed on the DuckDB
 * engine, never warehouse relations.
 */
export const getSqlBuilderForExplore = (
    explore: Pick<Explore, 'type'>,
    warehouseCredentials: Pick<
        CreateWarehouseCredentials,
        'type' | 'startOfWeek'
    >,
) =>
    explore.type === ExploreType.EXTERNAL_SOURCE
        ? warehouseSqlBuilderFromType(
              SupportedDbtAdapter.DUCKDB,
              warehouseCredentials.startOfWeek,
          )
        : warehouseSqlBuilderFromType(
              warehouseCredentials.type,
              warehouseCredentials.startOfWeek,
          );
