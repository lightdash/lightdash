import {
    DimensionType,
    ParameterError,
    QueryExecutionContext,
    QuerySourceType,
    type Account,
} from '@lightdash/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AsyncQueryService } from '../../../services/AsyncQueryService/AsyncQueryService';
import type { ProjectService } from '../../../services/ProjectService/ProjectService';
import type { ExternalSourceModel } from '../../models/ExternalSourceModel';
import { ExternalQuerySource } from './ExternalQuerySource';

const account = { user: { id: 'user-1' } } as unknown as Account;

const submitArgs = {
    account,
    projectUuid: 'project-1',
    context: QueryExecutionContext.API,
    resolvedReferences: {},
    parameters: {},
    userAttributeOverrides: {},
    invalidateCache: false,
    pivotConfiguration: null,
};

describe('ExternalQuerySource', () => {
    const executeAsyncExternalSqlQuery = vi
        .fn()
        .mockResolvedValue({ queryUuid: 'query-1' });
    const getAllExploresSummary = vi.fn();
    const listReadyTables = vi.fn();

    const source = new ExternalQuerySource({
        asyncQueryService: {
            executeAsyncExternalSqlQuery,
        } as unknown as AsyncQueryService,
        projectService: {
            getAllExploresSummary,
        } as unknown as ProjectService,
        externalSourceModel: {
            listReadyTables,
        } as unknown as ExternalSourceModel,
    });

    beforeEach(() => {
        vi.clearAllMocks();
        executeAsyncExternalSqlQuery.mockResolvedValue({
            queryUuid: 'query-1',
        });
    });

    it('rejects queries of another source type', async () => {
        await expect(
            source.submitQuery({
                ...submitArgs,
                query: { sourceType: QuerySourceType.SQL, sql: 'SELECT 1' },
            }),
        ).rejects.toThrow(ParameterError);
    });

    it('has no DAG edges: external tables are durable files', () => {
        expect(
            source.getQueryReferences({
                sourceType: QuerySourceType.EXTERNAL,
                sql: 'SELECT 1',
                tables: ['monthly_targets'],
            }),
        ).toEqual([]);
    });

    it('normalizes the array shorthand to a name-keyed map', async () => {
        const result = await source.submitQuery({
            ...submitArgs,
            query: {
                sourceType: QuerySourceType.EXTERNAL,
                sql: 'SELECT * FROM monthly_targets',
                tables: ['monthly_targets', 'other_table'],
            },
        });

        expect(result).toEqual({ queryUuid: 'query-1' });
        expect(executeAsyncExternalSqlQuery).toHaveBeenCalledWith({
            account,
            projectUuid: 'project-1',
            context: QueryExecutionContext.API,
            sql: 'SELECT * FROM monthly_targets',
            limit: undefined,
            tables: {
                monthly_targets: 'monthly_targets',
                other_table: 'other_table',
            },
            parameters: {},
            invalidateCache: false,
        });
    });

    it('hands parameters and cache control to the external SQL execution', async () => {
        await source.submitQuery({
            ...submitArgs,
            parameters: { region: 'EU' },
            invalidateCache: true,
            query: {
                sourceType: QuerySourceType.EXTERNAL,
                sql: 'SELECT * FROM t WHERE region = ${ld.parameters.region}',
                tables: ['t'],
            },
        });

        expect(executeAsyncExternalSqlQuery).toHaveBeenCalledWith(
            expect.objectContaining({
                parameters: { region: 'EU' },
                invalidateCache: true,
            }),
        );
    });

    it('refuses a pivot until the join node owns the pivot stage', async () => {
        await expect(
            source.submitQuery({
                ...submitArgs,
                pivotConfiguration: {
                    indexColumn: undefined,
                    valuesColumns: [],
                    groupByColumns: undefined,
                    sortBy: undefined,
                },
                query: {
                    sourceType: QuerySourceType.EXTERNAL,
                    sql: 'SELECT * FROM t',
                    tables: ['t'],
                },
            }),
        ).rejects.toThrow(ParameterError);
        expect(executeAsyncExternalSqlQuery).not.toHaveBeenCalled();
    });

    it('passes the map form through unchanged', async () => {
        await source.submitQuery({
            ...submitArgs,
            query: {
                sourceType: QuerySourceType.EXTERNAL,
                sql: 'SELECT * FROM t',
                limit: 10,
                tables: { t: '7b8ac342-0000-4000-8000-000000000001' },
            },
        });

        expect(executeAsyncExternalSqlQuery).toHaveBeenCalledWith(
            expect.objectContaining({
                limit: 10,
                tables: { t: '7b8ac342-0000-4000-8000-000000000001' },
            }),
        );
    });

    it('scans only tables whose explore the caller can see, with raw columns', async () => {
        getAllExploresSummary.mockResolvedValue([
            {
                name: 'monthly_targets',
                externalSource: {
                    sourceUuid: 'source-1',
                    tableUuid: 'table-1',
                    sourceType: 'csv',
                },
            },
            { name: 'orders' },
            { name: 'broken', errors: [{ type: 'x', message: 'boom' }] },
        ]);
        listReadyTables.mockResolvedValue([
            {
                external_source_table_uuid: 'table-1',
                name: 'monthly_targets',
                label: 'Monthly targets',
                columns: {
                    _month: { reference: '_month', type: DimensionType.DATE },
                    _target: {
                        reference: '_target',
                        type: DimensionType.NUMBER,
                    },
                },
            },
            {
                external_source_table_uuid: 'table-hidden',
                name: 'hidden_table',
                label: 'Hidden',
                columns: {
                    a: { reference: 'a', type: DimensionType.STRING },
                },
            },
        ]);

        const schema = await source.scanSchema({
            account,
            projectUuid: 'project-1',
        });

        expect(schema).toEqual({
            sourceType: QuerySourceType.EXTERNAL,
            tables: [
                {
                    reference: 'monthly_targets',
                    label: 'Monthly targets',
                    description: null,
                    columns: [
                        {
                            reference: '_month',
                            type: DimensionType.DATE,
                            label: null,
                            description: null,
                        },
                        {
                            reference: '_target',
                            type: DimensionType.NUMBER,
                            label: null,
                            description: null,
                        },
                    ],
                },
            ],
        });
    });
});
