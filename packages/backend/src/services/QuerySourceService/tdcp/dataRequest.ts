import { ParameterError, type TdcpSourceQuery } from '@lightdash/common';
import {
    TdcpMethods,
    type TdcpQueryRequest,
    type TdcpReadRequest,
} from '@lightdash/tdcp';

/**
 * The two public forms of a tdcp source query onto the protocol: `table`
 * becomes a tier 0 read, `dialect` + `query` a tier 2 query. Exactly one
 * form — a mixed or empty request is a caller error, not a guess.
 */
export const tdcpSourceQueryToDataRequest = (
    query: TdcpSourceQuery,
): TdcpReadRequest | TdcpQueryRequest => {
    if (query.table !== undefined) {
        if (query.dialect !== undefined || query.query !== undefined) {
            throw new ParameterError(
                'A tdcp query takes either "table" or "dialect"+"query", not both',
            );
        }
        return {
            method: TdcpMethods.READ,
            table: query.table,
            limit: query.limit,
        };
    }
    if (query.dialect === undefined || query.query === undefined) {
        throw new ParameterError(
            'A tdcp query needs "table" (read) or both "dialect" and "query"',
        );
    }
    return {
        method: TdcpMethods.QUERY,
        dialect: query.dialect,
        query: query.query,
        limit: query.limit,
    };
};
