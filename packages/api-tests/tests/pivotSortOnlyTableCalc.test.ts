import { SEED_PROJECT } from '@lightdash/common';
import { beforeAll, describe, expect, it } from 'vitest';
import { ApiClient, Body } from '../helpers/api-client';
import { login } from '../helpers/auth';

const apiUrl = '/api/v2';

const fieldReference = (id: string) => `\${${id}}`;

type ResultRow = Record<string, { value: { raw: unknown; formatted: string } }>;

type QueryResultsBody = Body<{
    status: string;
    rows: ResultRow[];
    error?: string;
    pivotDetails: {
        valuesColumns: {
            pivotColumnName: string;
            pivotValues: { value: unknown }[];
        }[];
    } | null;
}>;

async function pollQueryResults(
    client: ApiClient,
    projectUuid: string,
    queryUuid: string,
    maxRetries = 60,
): Promise<QueryResultsBody> {
    // eslint-disable-next-line no-plusplus
    for (let i = 0; i < maxRetries; i++) {
        // eslint-disable-next-line no-await-in-loop
        const resp = await client.get<QueryResultsBody>(
            `${apiUrl}/projects/${projectUuid}/query/${queryUuid}?page=1&pageSize=500`,
        );
        const { results } = resp.body;
        if (results.error) {
            throw new Error(`Query failed: ${results.error}`);
        }
        if (results.status === 'ready') {
            return resp.body;
        }
        // eslint-disable-next-line no-await-in-loop
        await new Promise((resolve) => {
            setTimeout(resolve, 1000);
        });
    }
    throw new Error('Query did not become ready in time');
}

describe('Pivot sorting by a sort-only table calculation', () => {
    const projectUuid = SEED_PROJECT.project_uuid;
    let client: ApiClient;

    beforeAll(async () => {
        client = await login();
    });

    // Regression test for the metric-sort anchor misclassification: sorting a
    // grouped chart by an undisplayed table calc must order rows across ALL
    // pivot columns, not only the first one (which left every other group's
    // rows clumped at the end).
    it('orders pivoted rows by the table calc across all groups', async () => {
        const body = {
            context: 'exploreView',
            query: {
                exploreName: 'prospects',
                dimensions: [
                    'prospects_request_month_month_name',
                    'prospects_request_month_month',
                    'prospects_request_month_year',
                    'prospects_request_month_month_num',
                    'prospects_ay_season_year',
                ],
                metrics: ['prospects_count_prospects'],
                filters: {},
                sorts: [
                    { fieldId: 'month_order', descending: false },
                    { fieldId: 'prospects_ay_season_year', descending: false },
                ],
                limit: 500,
                tableCalculations: [
                    {
                        name: 'month_order',
                        displayName: 'Month Order',
                        sql: `MOD(CAST(${fieldReference(
                            'prospects.request_month_month_num',
                        )} AS INT) + 8, 12)`,
                        type: 'number',
                    },
                    {
                        name: 'cumulative_prospect_volume',
                        displayName: 'Cumulative Prospect Volume',
                        sql: `SUM(${fieldReference(
                            'prospects.count_prospects',
                        )}) OVER (PARTITION BY ${fieldReference(
                            'prospects.ay_season_year',
                        )} ORDER BY ${fieldReference(
                            'prospects.request_month_month',
                        )} ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)`,
                        type: 'number',
                    },
                ],
                additionalMetrics: [],
            },
            pivotConfiguration: {
                indexColumn: [
                    {
                        reference: 'prospects_request_month_month_name',
                        type: 'category',
                    },
                    {
                        reference: 'prospects_request_month_month',
                        type: 'time',
                    },
                    { reference: 'prospects_request_month_year', type: 'time' },
                    {
                        reference: 'prospects_request_month_month_num',
                        type: 'category',
                    },
                ],
                valuesColumns: [
                    {
                        reference: 'cumulative_prospect_volume',
                        aggregation: 'any',
                    },
                ],
                sortOnlyColumns: [
                    { reference: 'month_order', aggregation: 'any' },
                ],
                groupByColumns: [{ reference: 'prospects_ay_season_year' }],
                sortBy: [
                    { reference: 'month_order', direction: 'ASC' },
                    { reference: 'prospects_ay_season_year', direction: 'ASC' },
                ],
            },
        };

        const createResp = await client.post<Body<{ queryUuid: string }>>(
            `${apiUrl}/projects/${projectUuid}/query/metric-query`,
            body,
        );
        expect(createResp.status).toBe(200);

        const { rows, pivotDetails } = (
            await pollQueryResults(
                client,
                projectUuid,
                createResp.body.results.queryUuid,
            )
        ).results;

        expect(rows).toHaveLength(88);

        const getRaw = (row: ResultRow, fieldId: string) =>
            row[fieldId].value.raw;

        // Fiscal month-major order: every season's April first, in season
        // order, then every season's May, and so on.
        const monthNames = rows.map((row) =>
            getRaw(row, 'prospects_request_month_month_name'),
        );
        expect(monthNames.slice(0, 8)).toEqual(Array(8).fill('April'));
        expect(monthNames[8]).toBe('May');

        const aprilMonths = rows
            .slice(0, 8)
            .map((row) =>
                String(getRaw(row, 'prospects_request_month_month')).slice(
                    0,
                    7,
                ),
            );
        expect(aprilMonths).toEqual([
            '2019-04',
            '2020-04',
            '2021-04',
            '2022-04',
            '2023-04',
            '2024-04',
            '2025-04',
            '2026-04',
        ]);

        // Last fiscal month: March of the final complete season
        const lastRow = rows[rows.length - 1];
        expect(getRaw(lastRow, 'prospects_request_month_month_name')).toBe(
            'March',
        );
        expect(
            String(getRaw(lastRow, 'prospects_request_month_month')).slice(
                0,
                7,
            ),
        ).toBe('2026-03');

        // Pivot columns stay in season order (ties on the calc's per-group
        // minimum fall back to the group dimension)
        const seasons = pivotDetails?.valuesColumns.map((col) =>
            String(col.pivotValues[0].value),
        );
        expect(seasons).toEqual([
            '2019',
            '2020',
            '2021',
            '2022',
            '2023',
            '2024',
            '2025',
            '2026',
        ]);
    });
});
