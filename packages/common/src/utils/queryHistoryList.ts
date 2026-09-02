import type { ExecuteAsyncQueryRequestParams } from '../types/api/paginatedQuery';
import { friendlyName } from '../types/field';
import type { ItemsMap } from '../types/field';
import type { MetricQuery } from '../types/metricQuery';
import {
    QueryLanguage,
    SQL_LANGUAGE_REQUEST_PARAMETER_KEYS,
} from '../types/queryHistoryList';
import { getItemLabelWithoutTableName } from './item';

export const getQueryLanguage = (
    requestParameters: ExecuteAsyncQueryRequestParams | null,
): QueryLanguage =>
    requestParameters &&
    SQL_LANGUAGE_REQUEST_PARAMETER_KEYS.some((key) => key in requestParameters)
        ? QueryLanguage.SQL
        : QueryLanguage.SEMANTIC;

const getFieldLabel = (fields: ItemsMap, fieldId: string): string => {
    const item = fields[fieldId];
    if (!item) return friendlyName(fieldId);
    try {
        return getItemLabelWithoutTableName(item);
    } catch {
        return friendlyName(fieldId);
    }
};

/**
 * Semantic subline: metric labels, then dimension labels — e.g.
 * "Total revenue, Order count · by Order date (week)".
 */
export const getSemanticQuerySummary = (
    metricQuery: Pick<MetricQuery, 'metrics' | 'dimensions'>,
    fields: ItemsMap,
): string => {
    const metrics = metricQuery.metrics.map((fieldId) =>
        getFieldLabel(fields, fieldId),
    );
    const dimensions = metricQuery.dimensions.map((fieldId) =>
        getFieldLabel(fields, fieldId),
    );
    const parts: string[] = [];
    if (metrics.length > 0) parts.push(metrics.join(', '));
    if (dimensions.length > 0) parts.push(`by ${dimensions.join(', ')}`);
    return parts.join(' · ');
};

/**
 * SQL title fallback when the run has no saved chart: the first CTE name, or
 * failing that the last path component of the first `FROM` target.
 */
export const getSqlQueryTitle = (compiledSql: string): string | null => {
    const cte = compiledSql.match(/^\s*with\s+"?([\w$]+)"?\s+as/i);
    if (cte) return cte[1];
    const from = compiledSql.match(/\bfrom\s+([\w$."`]+)/i);
    if (from) {
        const target = from[1].replace(/["`]/g, '');
        const parts = target.split('.');
        return parts[parts.length - 1] || null;
    }
    return null;
};

/** First non-empty line of SQL, for the row subline. */
export const getSqlFirstLine = (compiledSql: string): string =>
    compiledSql
        .split('\n')
        .map((line) => line.trim())
        .find((line) => line.length > 0) ?? '';
