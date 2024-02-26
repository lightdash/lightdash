import {
    ParameterError,
    SearchFilters,
    SearchItemType,
} from '@lightdash/common';
import { Knex } from 'knex';
import moment from 'moment';

export function shouldSearchForType(
    entityType: SearchItemType,
    queryTypeFilter?: string,
) {
    // if there is no filter or if the filter is the same as the entityType
    return !queryTypeFilter || queryTypeFilter === entityType;
}

export function filterByCreatedAt<T extends {}, R>(
    tableName: string,
    query: Knex.QueryBuilder<T, R>,
    filters: SearchFilters = {},
) {
    const { fromDate, toDate } = filters;
    const fromDateObj = fromDate ? moment(fromDate).utc() : undefined;
    const toDateObj = toDate ? moment(toDate).utc() : undefined;
    const now = moment();

    if (fromDateObj?.isAfter(toDateObj)) {
        throw new ParameterError('fromDate cannot be after toDate');
    }

    if (fromDateObj) {
        if (!fromDateObj.isValid()) {
            throw new ParameterError('fromDate is not valid');
        }

        if (fromDateObj.isAfter(now)) {
            throw new ParameterError('fromDate cannot be in the future');
        }

        query.whereRaw(
            `Date(${tableName}.created_at) >= ?`,
            fromDateObj.startOf('day').toDate(),
        );
    }

    if (toDateObj) {
        if (!toDateObj.isValid()) {
            throw new ParameterError('toDate is not valid');
        }

        if (toDateObj.isAfter(now)) {
            throw new ParameterError('toDate cannot be in the future');
        }

        query.whereRaw(
            `Date(${tableName}.created_at) <= ?`,
            toDateObj.endOf('day').toDate(),
        );
    }

    return query;
}

export function filterByCreatedByUuid<T extends {}, R>(
    query: Knex.QueryBuilder<T, R>,
    opts: {
        join?: {
            isVersioned?: boolean;
            joinTableName: string;
            joinTableIdColumnName: string;
            joinTableUserUuidColumnName: string;
            tableIdColumnName: string;
        };
        tableName: string;
        tableUserUuidColumnName?: string;
    },
    filters: SearchFilters = {},
) {
    const { createdByUuid } = filters;

    if (createdByUuid) {
        // if entity doesn't have a user uuid, we need to join with the table that has it
        if (opts.join) {
            const filterQuery = query
                .innerJoin(
                    opts.join.joinTableName,
                    `${opts.join.joinTableName}.${opts.join.joinTableIdColumnName}`,
                    `${opts.tableName}.${opts.join.tableIdColumnName}`,
                )
                .where(
                    `${opts.join.joinTableName}.${opts.join.joinTableUserUuidColumnName}`,
                    createdByUuid,
                );

            // if entity is versioned, we need to filter by the latest version
            if (opts.join.isVersioned) {
                return filterQuery
                    .orderBy(`${opts.join.joinTableName}.created_at`, 'desc')
                    .limit(1);
            }

            return filterQuery;
        }

        // if entity has a user uuid, we can filter directly
        if (opts.tableUserUuidColumnName) {
            return query.where(
                `${opts.tableName}.${opts.tableUserUuidColumnName}`,
                createdByUuid,
            );
        }
    }

    return query;
}
