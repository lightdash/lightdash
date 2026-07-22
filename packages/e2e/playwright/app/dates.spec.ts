import { SEED_PROJECT } from '@lightdash/common';
import { expect, test } from '@playwright/test';

const localTimestampByTimezone = {
    UTC: '2020-08-11 22:58:00',
    'Europe/Madrid': '2020-08-12 00:58:00',
    'America/New_York': '2020-08-11 18:58:00',
    'Asia/Tokyo': '2020-08-12 07:58:00',
};

type SupportedTimezone = keyof typeof localTimestampByTimezone;

const parseTimezone = (timezone: string | undefined): SupportedTimezone => {
    switch (timezone) {
        case 'UTC':
        case 'Europe/Madrid':
        case 'America/New_York':
        case 'Asia/Tokyo':
            return timezone;
        default:
            throw new Error(
                `Invalid timezone (${timezone}) to test. Set TZ to a supported timezone.`,
            );
    }
};

const timezone = parseTimezone(process.env.TZ);

test.use({ timezoneId: timezone });

const chart = {
    tableName: 'events',
    metricQuery: {
        exploreName: '',
        dimensions: ['events_timestamp_tz_raw'],
        metrics: ['events_count'],
        filters: {
            dimensions: {
                id: '3b565490-87c5-4996-a42b-ff0640bb18cd',
                and: [
                    {
                        id: 'be863f3c-5807-48c5-9b6f-2e8445610280',
                        target: { fieldId: 'events_timestamp_tz_raw' },
                        operator: 'equals',
                        values: ['2020-08-12T00:58:00+02:00'],
                    },
                ],
            },
        },
        sorts: [
            {
                fieldId: 'events_timestamp_tz_raw',
                descending: true,
            },
        ],
        limit: 500,
        tableCalculations: [],
        additionalMetrics: [],
    },
    tableConfig: {
        columnOrder: ['events_timestamp_tz_raw', 'events_count'],
    },
    chartConfig: {
        type: 'cartesian',
        config: {
            layout: {
                xField: 'events_timestamp_tz_raw',
                yField: ['events_count'],
            },
            eChartsConfig: {
                series: [
                    {
                        type: 'bar',
                        yAxisIndex: 0,
                        encode: {
                            xRef: { field: 'events_timestamp_tz_raw' },
                            yRef: { field: 'events_count' },
                        },
                    },
                ],
            },
        },
    },
};

const exploreUrl = `/projects/${SEED_PROJECT.project_uuid}/tables/events?create_saved_chart_version=${encodeURIComponent(JSON.stringify(chart))}`;

test('admin sees UTC dates rendered in the client timezone', async ({
    page,
}) => {
    await page.goto(exploreUrl);

    const runQueryButton = page.getByRole('button', {
        name: 'Run query (500)',
        exact: true,
    });
    await expect(runQueryButton).toHaveCount(1);

    const queryResponsePromise = page.waitForResponse(
        (response) =>
            response.request().method() === 'POST' &&
            new URL(response.url()).pathname ===
                `/api/v2/projects/${SEED_PROJECT.project_uuid}/query/metric-query`,
    );
    await runQueryButton.click();
    const queryResponse = await queryResponsePromise;
    expect(queryResponse.ok()).toBe(true);

    await expect(page.getByText('Loading chart', { exact: true })).toHaveCount(
        0,
    );

    const results = page.getByTestId('results-table-container');
    await expect(results).toContainText('2020-08-11, 22:58:00:000 (+00:00)');

    const filtersCard = page.getByTestId('Filters-card');
    await expect(filtersCard).toContainText('1 active filter');
    await filtersCard.getByTestId('Filters-card-expand').click();

    const filterRule = filtersCard.getByTestId('FilterRuleForm/filter-rule');
    await expect(filterRule).toContainText('11 Aug 2020 22:58:00');
    await expect(
        filterRule.getByRole('button', {
            name: localTimestampByTimezone[timezone],
            exact: true,
        }),
    ).toBeVisible();

    const sqlCard = page.getByTestId('SQL-card');
    await sqlCard.getByTestId('SQL-card-expand').click();
    await expect(sqlCard).toContainText(
        `("events".timestamp_tz) = ('2020-08-11 22:58:00+00:00')`,
    );
});
