import {
    QueryExecutionContext,
    QueryHistoryStatus,
    type QueryHistory,
} from '@lightdash/common';
import {
    getSavedQueryAiSignInProvenance,
    savedResultHasAiSignInProvenance,
    withholdSavedRows,
} from './savedResultEgress';

describe('saved result egress', () => {
    it('marks only a completed direct AI query by the same user and AI sign-in', () => {
        const userUuid = '11111111-1111-4111-8111-111111111111';
        const aiSignInCredentialUuid = '22222222-2222-4222-8222-222222222222';
        const metadata = {
            status: 'success',
            queryUuid: '33333333-3333-4333-8333-333333333333',
            queryCacheHit: false,
            queryReuseHit: false,
        };
        const history = {
            queryUuid: metadata.queryUuid,
            context: QueryExecutionContext.AI,
            status: QueryHistoryStatus.READY,
            createdByUserUuid: userUuid,
            preAggregateExecution: null,
            requestParameters: {
                aiSignInCredentialUuid,
            } as QueryHistory['requestParameters'],
        } as QueryHistory;
        expect(
            getSavedQueryAiSignInProvenance(metadata, history, userUuid),
        ).toEqual({
            aiSignInFetchedRows: true,
            aiSignInUserUuid: userUuid,
            aiSignInCredentialUuid,
        });
        expect(
            getSavedQueryAiSignInProvenance(
                { ...metadata, queryCacheHit: true },
                history,
                userUuid,
            ),
        ).toBeNull();
        expect(
            getSavedQueryAiSignInProvenance(
                metadata,
                { ...history, preAggregateExecution: 'duckdb' },
                userUuid,
            ),
        ).toBeNull();
        expect(
            getSavedQueryAiSignInProvenance(
                metadata,
                {
                    ...history,
                    requestParameters: {
                        ...history.requestParameters,
                        aiSignInCredentialUuid: undefined,
                    },
                },
                userUuid,
            ),
        ).toBeNull();
        expect(
            getSavedQueryAiSignInProvenance(
                metadata,
                { ...history, createdByUserUuid: 'other-user' },
                userUuid,
            ),
        ).toBeNull();
    });

    it('treats an absent provenance marker as unverified', () => {
        const userUuid = '11111111-1111-4111-8111-111111111111';
        const aiSignInCredentialUuid = '22222222-2222-4222-8222-222222222222';
        expect(savedResultHasAiSignInProvenance(null, userUuid)).toBeNull();
        expect(
            savedResultHasAiSignInProvenance({ status: 'success' }, userUuid),
        ).toBeNull();
        expect(
            savedResultHasAiSignInProvenance(
                { aiSignInFetchedRows: false },
                userUuid,
            ),
        ).toBeNull();
        expect(
            savedResultHasAiSignInProvenance(
                { aiSignInFetchedRows: true },
                userUuid,
            ),
        ).toBeNull();
        expect(
            savedResultHasAiSignInProvenance(
                {
                    aiSignInFetchedRows: true,
                    aiSignInUserUuid: userUuid,
                    aiSignInCredentialUuid,
                },
                userUuid,
            ),
        ).toBe(aiSignInCredentialUuid);
        expect(
            savedResultHasAiSignInProvenance(
                {
                    aiSignInFetchedRows: true,
                    aiSignInUserUuid: userUuid,
                    aiSignInCredentialUuid,
                },
                '33333333-3333-4333-8333-333333333333',
            ),
        ).toBeNull();
    });

    it('keeps CSV fields and row count without retaining surrounding text', async () => {
        const result = await withholdSavedRows(
            'runQuery',
            'WAREHOUSE_ROW_SECRET\n```csv\nName,Count\nWAREHOUSE_ROW_SECRET,1\n```',
        );

        expect(result).toContain('Name');
        expect(result).toContain('rowCount');
        expect(result).not.toContain('WAREHOUSE_ROW_SECRET');
    });

    it('withholds non-CSV result shapes conservatively', async () => {
        expect(
            await withholdSavedRows(
                'getDashboardCharts',
                '{"rows":[{"name":"WAREHOUSE_ROW_SECRET"}]}',
            ),
        ).toContain('row count unavailable');
    });
});
