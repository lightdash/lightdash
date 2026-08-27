import {
    QueryExecutionContext,
    type QueryHistoryListItem,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { canRerunQuery } from './useRerunQuery';

const queryHistoryItem = (
    requestParameters: QueryHistoryListItem['requestParameters'],
) =>
    ({
        requestParameters,
    }) as QueryHistoryListItem;

describe('canRerunQuery', () => {
    it('allows supported queries without saved SQL provenance', () => {
        expect(
            canRerunQuery(
                queryHistoryItem({
                    context: QueryExecutionContext.EXPLORE,
                    query: {} as never,
                }),
            ),
        ).toBe(true);
    });

    it('prevents generic replay of saved SQL derivatives', () => {
        expect(
            canRerunQuery(
                queryHistoryItem({
                    context: QueryExecutionContext.EXPLORE,
                    query: {} as never,
                    savedSqlUuids: ['saved-sql-uuid'],
                }),
            ),
        ).toBe(false);
    });
});
