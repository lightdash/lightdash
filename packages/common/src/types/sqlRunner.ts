import { DimensionType } from './field';

export type ApiSqlQueryResults = {
    fields: Record<string, { type: DimensionType }>;
    rows: Record<string, unknown>[];
};
