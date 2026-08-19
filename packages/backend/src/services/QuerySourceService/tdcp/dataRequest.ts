import { ParameterError, type TdcpSourceQuery } from '@lightdash/common';
import {
    TdcpMethods,
    type TdcpQueryRequest,
    type TdcpReadRequest,
    type TdcpScanRequest,
} from '@lightdash/tdcp';

/**
 * The three public forms of a tdcp source query onto the protocol: `table`
 * alone is a tier 0 read, `table` + `predicateMode` a tier 1 scan, and
 * `dialect` + (`query` | `params`) a tier 2 query. Exactly one form — a
 * mixed or empty request is a caller error, not a guess.
 */
export const tdcpSourceQueryToDataRequest = (
    query: TdcpSourceQuery,
): TdcpReadRequest | TdcpScanRequest | TdcpQueryRequest => {
    if (query.table !== undefined) {
        if (
            query.dialect !== undefined ||
            query.query !== undefined ||
            query.params !== undefined
        ) {
            throw new ParameterError(
                'A tdcp query takes either "table" (read/scan) or "dialect" with "query"/"params", not both',
            );
        }
        if (query.predicateMode !== undefined) {
            return {
                method: TdcpMethods.SCAN,
                table: query.table,
                columns: query.columns,
                predicates: query.predicates,
                predicateMode: query.predicateMode,
                limit: query.limit,
            };
        }
        if (query.columns !== undefined || query.predicates !== undefined) {
            throw new ParameterError(
                'A tdcp scan needs "predicateMode" alongside "columns"/"predicates"',
            );
        }
        return {
            method: TdcpMethods.READ,
            table: query.table,
            limit: query.limit,
        };
    }
    if (query.dialect === undefined) {
        throw new ParameterError(
            'A tdcp query needs "table" (read/scan) or a "dialect" with "query"/"params"',
        );
    }
    if (
        query.predicateMode !== undefined ||
        query.columns !== undefined ||
        query.predicates !== undefined
    ) {
        throw new ParameterError(
            'Scan fields ("columns", "predicates", "predicateMode") apply to the table form, not to dialect queries',
        );
    }
    if ((query.query === undefined) === (query.params === undefined)) {
        throw new ParameterError(
            'A tdcp dialect query takes exactly one of "query" (text dialects) or "params" (structured dialects)',
        );
    }
    return {
        method: TdcpMethods.QUERY,
        dialect: query.dialect,
        query: query.query,
        params: query.params,
        limit: query.limit,
    };
};
