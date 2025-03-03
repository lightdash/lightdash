import type { DbtColumnLightdashDimension } from '../types/dbt';
import { type CustomSqlDimension, friendlyName } from '../types/field';

export const convertCustomDimensionToDbt = (
    field: CustomSqlDimension,
): DbtColumnLightdashDimension => ({
    label: friendlyName(field.name),
    name: field.id,
    description: '', // TODO :: leave it here so that customer can easily fill in?
    type: field.dimensionType,
    sql: field.sql,
});
