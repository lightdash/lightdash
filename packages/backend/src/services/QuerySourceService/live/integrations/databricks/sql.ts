import { SupportedDbtAdapter } from '@lightdash/common';
import { warehouseSqlBuilderFromType } from '@lightdash/warehouses';

/** The Databricks dialect of the warehouse SQL builder; weeks start on Monday, as in Databricks. */
export const DATABRICKS_SQL_BUILDER = warehouseSqlBuilderFromType(
    SupportedDbtAdapter.DATABRICKS,
);
