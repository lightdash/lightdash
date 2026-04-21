import { SEED_PROJECT } from '@lightdash/common';
import dayjs from 'dayjs';
import { expect, test } from '../../fixtures';
import { getMonacoEditorText } from '../../helpers';

function leadingZero(value: string | number) {
    return `0${value}`.slice(-2);
}
function getFullMonth(date: Date) {
    return leadingZero(date.getMonth() + 1);
}
function getLocalISOString(date: Date) {
    return `${date.getFullYear()}-${getFullMonth(date)}-${leadingZero(
        date.getDate(),
    )}`;
}
function getHourOffset() {
    const now = new Date('1 January, 2000'); // set specific date to avoid daylight savings
    const regex = /([+-]\d{4})/;
    const match = now.toTimeString().match(regex);

    // Check if we found a match
    if (match) {
        return match[1]; // eg: +0200
    }
    return null; // Return null if no match was found
}

function getLocalTime(datetime: string) {
    return dayjs(`${datetime} UTC`).format('YYYY-MM-DD HH:mm:ss');
}

test.describe('Date tests', () => {
    // todo: delete
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    test.skip('Check current timezone', async ({ adminPage: _page }) => {
        const now = new Date('1 January, 2000'); // set specific date to avoid daylight savings
        const timezone = process.env.TZ;
        const offset = now.getTimezoneOffset();
        const errorMessage = `Timezone offset ${offset} doesn't match timezone ${timezone}. Are both env variables TZ set ?`;
        switch (timezone) {
            case 'UTC':
                expect(offset, errorMessage).toBe(0);
                expect(getHourOffset()).toBe('+0000');
                expect(getLocalTime('2020-08-11 22:58:00')).toBe(
                    '2020-08-11 22:58:00',
                );
                break;
            case 'Europe/Madrid':
                expect(offset, errorMessage).toBe(-60);
                expect(getHourOffset()).toBe('+0100');
                expect(getLocalTime('2020-08-11 22:58:00')).toBe(
                    '2020-08-12 00:58:00',
                );
                break;
            case 'America/New_York':
                expect(offset, errorMessage).toBe(300);
                expect(getHourOffset()).toBe('-0500');
                expect(getLocalTime('2020-08-11 22:58:00')).toBe(
                    '2020-08-11 18:58:00',
                );
                break;
            case 'Asia/Tokyo':
                expect(offset, errorMessage).toBe(-540);
                expect(getHourOffset()).toBe('+0900');
                expect(getLocalTime('2020-08-11 22:58:00')).toBe(
                    '2020-08-12 07:58:00',
                );
                break;
            default:
                throw new Error(
                    `Invalid timezone (${timezone}) to test, please add TZ to your env with a valid timezone`,
                );
        }
    });

    // todo: move to unit test
    test.skip('Should get right month on filtered chart', async ({
        adminPage: page,
    }) => {
        await page.goto(`/projects/${SEED_PROJECT.project_uuid}/saved`);

        // find with search input "how many"
        await page.getByPlaceholder('Search by name').fill('how many');
        await page.getByText('How many orders did we get in June?').click();

        await page.getByTestId('Filters-card-expand').click();
        await expect(page.getByText('Loading chart')).toHaveCount(0);
        await expect(
            page.locator('tbody td').filter({ hasText: '2024-06' }),
        ).toBeVisible();
        await expect(
            page.locator('tbody td').filter({ hasText: '$843.10' }),
        ).toBeVisible();
        await expect(
            page.locator('tbody td').filter({ hasText: '26' }),
        ).toBeVisible();

        await page.getByTestId('Chart-card-expand').click(); // Collapse charts
        await page.getByTestId('SQL-card-expand').click();

        // Check compiled SQL contains the expected filter
        const text = await getMonacoEditorText(page);
        expect(text).toContain(
            `(DATE_TRUNC('MONTH', "orders".order_date)) = ('2024-06-01')`,
        );
    });

    // todo: move to unit test
    test.skip('Should use dashboard month filter', async ({
        adminPage: page,
    }) => {
        await page.goto(`/projects/${SEED_PROJECT.project_uuid}/dashboards`);

        // wait for the dashboard to load
        await expect(page.getByText('Loading dashboards')).toHaveCount(0);

        await page.getByRole('link', { name: 'Jaffle dashboard' }).click();

        const gridLayout = page.locator('.react-grid-layout');
        await expect(gridLayout.getByText('How much revenue')).toBeVisible();

        await expect(page.getByText('Loading chart')).toHaveCount(0); // Finish loading

        await expect(page.getByText('bank_transfer')).toBeVisible();

        const revenueItem = gridLayout
            .getByText(`What's our total revenue to date?`)
            .locator('..')
            .locator('..');
        await expect(revenueItem.getByText('1,961.5')).toBeVisible();

        // Add filter
        await page.getByText('Add filter').click();
        await page.getByTestId('FilterConfiguration/FieldSelect').click();
        await page
            .getByTestId('FilterConfiguration/FieldSelect')
            .locator('input')
            .fill('order date month');
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('Enter');

        await page.getByRole('button', { name: 'Select a date' }).click();
        const dialogs = page.getByRole('dialog');
        const secondDialog = dialogs.nth(1);
        await secondDialog.getByRole('button', { name: '2025' }).click();
        await secondDialog.getByRole('button', { name: '2024' }).click();
        await secondDialog.getByRole('button', { name: 'Jun' }).click();

        await page.getByText('Apply').click();

        await expect(page.getByText('Loading chart')).toHaveCount(0); // Finish loading

        const revenueItemAfterFilter = gridLayout
            .getByText(`What's our total revenue to date?`)
            .locator('..')
            .locator('..');
        await expect(revenueItemAfterFilter.getByText('468')).toBeVisible();
    });

    test('Should use UTC dates', async ({ adminPage: page }) => {
        const exploreStateUrlParams = `?create_saved_chart_version={"tableName"%3A"events"%2C"metricQuery"%3A{"exploreName"%3A""%2C"dimensions"%3A["events_timestamp_tz_raw"]%2C"metrics"%3A["events_count"]%2C"filters"%3A{"dimensions"%3A{"id"%3A"3b565490-87c5-4996-a42b-ff0640bb18cd"%2C"and"%3A[{"id"%3A"be863f3c-5807-48c5-9b6f-2e8445610280"%2C"target"%3A{"fieldId"%3A"events_timestamp_tz_raw"}%2C"operator"%3A"equals"%2C"values"%3A["2020-08-12T00%3A58%3A00%2B02%3A00"]}]}}%2C"sorts"%3A[{"fieldId"%3A"events_timestamp_tz_raw"%2C"descending"%3Atrue}]%2C"limit"%3A500%2C"tableCalculations"%3A[]%2C"additionalMetrics"%3A[]}%2C"tableConfig"%3A{"columnOrder"%3A["events_timestamp_tz_raw"%2C"events_count"]}%2C"chartConfig"%3A{"type"%3A"cartesian"%2C"config"%3A{"layout"%3A{"xField"%3A"events_timestamp_tz_raw"%2C"yField"%3A["events_count"]}%2C"eChartsConfig"%3A{"series"%3A[{"type"%3A"bar"%2C"yAxisIndex"%3A0%2C"encode"%3A{"xRef"%3A{"field"%3A"events_timestamp_tz_raw"}%2C"yRef"%3A{"field"%3A"events_count"}}}]}}}}`;
        await page.goto(
            `/projects/${SEED_PROJECT.project_uuid}/tables/events${exploreStateUrlParams}`,
        );
        await page.getByRole('button', { name: 'Run query' }).first().click();
        await expect(page.getByText('SQL')).toBeVisible();
        await expect(page.getByText('Loading chart')).toHaveCount(0);

        await expect(page.getByText('1 active filter')).toBeVisible();
        await page.getByTestId('Filters-card-expand').click();
        await expect(page.getByText('11 Aug 2020 22:58:00')).toBeVisible(); // Filter in UTC

        await expect(
            page.getByText(`2020-08-11, 22:58:00:000 (+00:00)`),
        ).toBeVisible(); // Data in results, this comes from the server, so depends on the server timezone

        // Time sensitive fields in localtime
        const timezone = process.env.TZ;
        switch (timezone) {
            case 'UTC':
                await expect(
                    page.getByText('2020-08-11 22:58:00'),
                ).toBeVisible(); // Filter in localtime
                break;
            case 'Europe/Madrid':
                await expect(
                    page.getByText('2020-08-12 00:58:00'),
                ).toBeVisible(); // Filter in localtime
                break;
            case 'America/New_York':
                await expect(
                    page.getByText('2020-08-11 18:58:00'),
                ).toBeVisible(); // Filter in localtime
                break;
            case 'Asia/Tokyo':
                await expect(
                    page.getByText('2020-08-12 07:58:00'),
                ).toBeVisible(); // Filter in localtime
                break;
            default:
                throw new Error(
                    `Invalid timezone (${timezone}) to test, please add TZ to your env with a valid timezone`,
                );
        }

        await page.getByTestId('SQL-card-expand').click();
        const sql = await getMonacoEditorText(page);
        expect(sql).toContain(
            `("events".timestamp_tz) = ('2020-08-11 22:58:00+00:00')`,
        );
    });

    // todo: move to unit test
    test.skip('Should filter by date on results table', async ({
        adminPage: page,
    }) => {
        // This test should not be timezone sensitive
        const exploreStateUrlParams = `?create_saved_chart_version=%7B%22tableName%22%3A%22orders%22%2C%22metricQuery%22%3A%7B%22dimensions%22%3A%5B%22orders_order_date_day%22%2C%22orders_order_date_week%22%2C%22orders_order_date_month%22%2C%22orders_order_date_year%22%5D%2C%22metrics%22%3A%5B%5D%2C%22filters%22%3A%7B%7D%2C%22sorts%22%3A%5B%7B%22fieldId%22%3A%22orders_order_date_day%22%2C%22descending%22%3Atrue%7D%5D%2C%22limit%22%3A1%2C%22tableCalculations%22%3A%5B%5D%2C%22additionalMetrics%22%3A%5B%5D%7D%2C%22tableConfig%22%3A%7B%22columnOrder%22%3A%5B%22orders_order_date_day%22%2C%22orders_order_date_week%22%2C%22orders_order_date_month%22%2C%22orders_order_date_year%22%5D%7D%2C%22chartConfig%22%3A%7B%22type%22%3A%22cartesian%22%2C%22config%22%3A%7B%22layout%22%3A%7B%22xField%22%3A%22orders_order_date_day%22%2C%22yField%22%3A%5B%22orders_order_date_week%22%5D%7D%2C%22eChartsConfig%22%3A%7B%22series%22%3A%5B%7B%22encode%22%3A%7B%22xRef%22%3A%7B%22field%22%3A%22orders_order_date_day%22%7D%2C%22yRef%22%3A%7B%22field%22%3A%22orders_order_date_week%22%7D%7D%2C%22type%22%3A%22bar%22%7D%5D%7D%7D%7D%7D`;
        await page.goto(
            `/projects/${SEED_PROJECT.project_uuid}/tables/orders${exploreStateUrlParams}`,
        );
        await page.getByRole('button', { name: 'Run query' }).first().click();
        await expect(page.getByText('SQL')).toBeVisible();
        await expect(page.getByText('Loading chart')).toHaveCount(0);

        await page.getByTestId('Filters-card-expand').click();
        await page.getByTestId('SQL-card-expand').click();
        await page.getByTestId('Chart-card-expand').click(); // Close chart

        await page.getByRole('button', { name: 'Run query' }).first().click();
        // Filter by year
        await page
            .locator('.mantine-Card-root tbody > :nth-child(1) > :nth-child(5)')
            .click();
        await page.getByText('Filter by 2025').click();
        await expect(
            page.locator('.mantine-YearPickerInput-input').getByText('2025'),
        ).toBeVisible();

        const textAfterYear = await getMonacoEditorText(page);
        expect(textAfterYear).toContain(
            `(DATE_TRUNC('YEAR', "orders".order_date)) = ('2025-01-01')`,
        );

        // Filter by month
        await page
            .locator('.mantine-Card-root tbody > :nth-child(1) > :nth-child(4)')
            .click();
        await page.getByText('Filter by 2025-06').click();

        await expect(
            page
                .locator('.mantine-MonthPickerInput-input')
                .getByText('June 2025'),
        ).toBeVisible();
        const textAfterMonth = await getMonacoEditorText(page);
        expect(textAfterMonth).toContain(
            `(DATE_TRUNC('MONTH', "orders".order_date)) = ('2025-06-01')`,
        );

        // Filter by week
        await page
            .locator('.mantine-Card-root tbody > :nth-child(1) > :nth-child(3)')
            .click();
        await page.getByText('Filter by 2025-06-09').click();
        await expect(page.locator('.mantine-DateInput-input')).toHaveValue(
            'June 9, 2025',
        );

        const textAfterWeek = await getMonacoEditorText(page);
        expect(textAfterWeek).toContain(
            `(DATE_TRUNC('WEEK', "orders".order_date)) = ('2025-06-09')`,
        );

        // Filter by day
        await page
            .locator('.mantine-Card-root tbody > :nth-child(1) > :nth-child(2)')
            .click();
        await page.getByText('Filter by 2025-06-15').click();
        await expect(page.locator('.mantine-DateInput-input')).toHaveValue(
            'June 9, 2025',
        );
        const textAfterDay = await getMonacoEditorText(page);
        expect(textAfterDay).toContain(
            `(DATE_TRUNC('DAY', "orders".order_date)) = ('2025-06-15')`,
        );
    });

    // todo: move to unit test
    test.skip('Should filter by datetimes on results table', async ({
        adminPage: page,
    }) => {
        const exploreStateUrlParams = `?create_saved_chart_version={"tableName"%3A"events"%2C"metricQuery"%3A{"dimensions"%3A["events_timestamp_tz_raw"%2C"events_timestamp_tz_millisecond"%2C"events_timestamp_tz_second"%2C"events_timestamp_tz_minute"%2C"events_timestamp_tz_hour"]%2C"metrics"%3A[]%2C"filters"%3A{}%2C"sorts"%3A[{"fieldId"%3A"events_timestamp_tz_raw"%2C"descending"%3Atrue}]%2C"limit"%3A1%2C"tableCalculations"%3A[]%2C"additionalMetrics"%3A[]}%2C"tableConfig"%3A{"columnOrder"%3A["events_timestamp_tz_raw"%2C"events_timestamp_tz_millisecond"%2C"events_timestamp_tz_second"%2C"events_timestamp_tz_minute"%2C"events_timestamp_tz_hour"]}%2C"chartConfig"%3A{"type"%3A"cartesian"%2C"config"%3A{"layout"%3A{"xField"%3A"events_timestamp_tz_raw"%2C"yField"%3A["events_timestamp_tz_millisecond"]}%2C"eChartsConfig"%3A{"series"%3A[{"encode"%3A{"xRef"%3A{"field"%3A"events_timestamp_tz_raw"}%2C"yRef"%3A{"field"%3A"events_timestamp_tz_millisecond"}}%2C"type"%3A"bar"}]}}}}`;
        await page.goto(
            `/projects/${SEED_PROJECT.project_uuid}/tables/events${exploreStateUrlParams}`,
        );
        await page.getByRole('button', { name: 'Run query' }).first().click();
        await expect(page.getByText('SQL')).toBeVisible();
        await expect(page.getByText('Loading chart')).toHaveCount(0);

        await page.getByTestId('Filters-card-expand').click();
        await page.getByTestId('SQL-card-expand').click();
        await page.getByTestId('Chart-card-expand').click(); // Close chart
        await page.getByRole('button', { name: 'Run query' }).first().click();

        // Filter by raw
        await page
            .locator('.mantine-Card-root tbody > :nth-child(1) > :nth-child(2)')
            .click();
        await page
            .getByText('Filter by 2020-08-11, 23:44:00:000 (+00:00)')
            .click(); // Server Timezone sensitive
        await expect(
            page.locator('.mantine-DateTimePicker-input').getByText(
                getLocalTime('2020-08-11 23:44:00'), // Timezone sensitive
            ),
        ).toBeVisible();
        const textAfterRaw = await getMonacoEditorText(page);
        expect(textAfterRaw).toContain(
            `("events".timestamp_tz) = ('2020-08-11 23:44:00')`,
        );

        // Filter by Millisecond
        await page
            .locator('.mantine-Card-root tbody > :nth-child(1) > :nth-child(3)')
            .click();
        await page
            .getByText('Filter by 2020-08-11, 23:44:00:000 (+00:00)')
            .click(); // Server Timezone sensitive
        await expect(
            page.locator('.mantine-DateTimePicker-input').getByText(
                getLocalTime('2020-08-11 23:44:00'), // Timezone sensitive
            ),
        ).toBeVisible();
        const textAfterMs = await getMonacoEditorText(page);
        expect(textAfterMs).toContain(
            `(DATE_TRUNC('MILLISECOND', "events".timestamp_tz)) = ('2020-08-11 23:44:00')`,
        ); // Known Millisecond limitation

        // Filter by Second
        await page
            .locator('.mantine-Card-root tbody > :nth-child(1) > :nth-child(4)')
            .click();
        await page.getByText('Filter by 2020-08-11, 23:44:00 (+00:00)').click(); // Server Timezone sensitive
        await expect(
            page.locator('.mantine-DateTimePicker-input').getByText(
                getLocalTime('2020-08-11 23:44:00'), // Timezone sensitive
            ),
        ).toBeVisible();
        const textAfterSecond = await getMonacoEditorText(page);
        expect(textAfterSecond).toContain(
            `(DATE_TRUNC('SECOND', "events".timestamp_tz)) = ('2020-08-11 23:44:00')`,
        );

        // Filter by Minute
        await page
            .locator('.mantine-Card-root tbody > :nth-child(1) > :nth-child(5)')
            .click();
        await page.getByText('Filter by 2020-08-11, 23:44 (+00:00)').click(); // Server Timezone sensitive
        await expect(
            page.locator('.mantine-DateTimePicker-input').getByText(
                getLocalTime('2020-08-11 23:44:00'), // Timezone sensitive
            ),
        ).toBeVisible();
        const textAfterMinute = await getMonacoEditorText(page);
        expect(textAfterMinute).toContain(
            `(DATE_TRUNC('MINUTE', "events".timestamp_tz)) = ('2020-08-11 23:44:00')`,
        );

        // Filter by Hour
        await page
            .locator('.mantine-Card-root tbody > :nth-child(1) > :nth-child(6)')
            .click();
        await page.getByText('Filter by 2020-08-11, 23 (+00:00)').click(); // Server Timezone sensitive
        await expect(
            page.locator('.mantine-DateTimePicker-input').getByText(
                getLocalTime('2020-08-11 23:00:00'), // Timezone sensitive
            ),
        ).toBeVisible();
        const textAfterHour = await getMonacoEditorText(page);
        expect(textAfterHour).toContain(
            `(DATE_TRUNC('HOUR', "events".timestamp_tz)) = ('2020-08-11 23:00:00')`,
        );
    });

    // todo: move to unit test
    test.skip('Should change dates on filters', async ({ adminPage: page }) => {
        await page.goto(`/projects/${SEED_PROJECT.project_uuid}/tables/orders`);

        await expect(page.getByTestId('page-spinner')).toHaveCount(0);
        await expect(page.getByText('No data available')).toBeVisible();
        await expect(
            page.getByText('Pick a metric & select its dimensions'),
        ).toBeVisible();
        await expect(page.getByText('Filters')).toBeVisible();

        // Filter by year
        await page.getByTestId('Filters-card-expand').click();
        await page.getByText('Add filter').click();
        await page.getByPlaceholder('Search field...').fill('Created year');
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('Enter');

        await page
            .getByRole('button', { name: String(new Date().getFullYear()) })
            .click();
        await page
            .getByRole('dialog')
            .getByRole('button', { name: '2024' })
            .click();

        await page.getByTestId('SQL-card-expand').click();
        const textAfterYear = await getMonacoEditorText(page);
        expect(textAfterYear).toContain(
            `(DATE_TRUNC('YEAR', "customers".created)) = ('2024-01-01')`,
        );

        await page.getByRole('button', { name: '2024' }).click();
        await page
            .getByRole('dialog')
            .getByRole('button', { name: '2025' })
            .click();
        const textAfterYear2 = await getMonacoEditorText(page);
        expect(textAfterYear2).toContain(
            `(DATE_TRUNC('YEAR', "customers".created)) = ('2025-01-01')`,
        );

        await page.getByTestId('delete-filter-rule-button').click();

        // Filter by month
        await page.getByText('Add filter').click();
        await page.getByPlaceholder('Search field...').fill('Created month');
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('Enter');

        await page
            .getByRole('button', { name: dayjs().format('MMMM YYYY') })
            .click();
        const dialog = page.getByRole('dialog');
        await dialog
            .getByRole('button', { name: dayjs().format('YYYY') })
            .click();
        await dialog.getByRole('button', { name: '2024' }).click();
        await dialog.getByRole('button', { name: 'Aug' }).click();

        const textAfterMonth = await getMonacoEditorText(page);
        expect(textAfterMonth).toContain(
            `(DATE_TRUNC('MONTH', "customers".created)) = ('2024-08-01')`,
        );

        await page.getByRole('button', { name: 'August 2024' }).click();
        const dialog2 = page.getByRole('dialog');
        await dialog2.getByRole('button', { name: '2024' }).click();
        await dialog2.getByRole('button', { name: '2025' }).click();
        await dialog2.getByRole('button', { name: 'Jun' }).click();

        const textAfterMonth2 = await getMonacoEditorText(page);
        expect(textAfterMonth2).toContain(
            `(DATE_TRUNC('MONTH', "customers".created)) = ('2025-06-01')`,
        );

        await page.getByTestId('delete-filter-rule-button').click();
    });

    // todo: move to unit test
    test.skip('Should keep value when changing date operator', async ({
        adminPage: page,
    }) => {
        const todayDate = new Date();

        await page.goto(
            `/projects/${SEED_PROJECT.project_uuid}/tables/customers`,
        );

        await expect(page.getByTestId('page-spinner')).toHaveCount(0);
        await expect(page.getByText('No data available')).toBeVisible(); // Chart panel is opened by default but it takes some time to open it
        await page.getByTestId('Chart-card-expand').click(); // Close chart
        await expect(
            page.getByText('Pick a metric & select its dimensions'),
        ).toBeVisible();

        await expect(page.getByText('Search Jaffle shop')).toBeVisible(); // Wait until it finishes loading the nav bar
        await expect(
            page.getByRole('button', { name: 'Save chart' }),
        ).toBeDisabled(); // Wait until it finishes loading the button
        await expect(page.getByText('Filters')).toBeVisible();

        await page.getByRole('button', { name: 'Run query' }).first().click();
        await expect(page.getByText('Loading chart')).toHaveCount(0);

        // Filter by day
        await page.getByTestId('Filters-card-expand').click();
        await page.getByText('Add filter').click();
        await page.getByPlaceholder('Search field...').fill('created day');
        await page.getByText('Created day').click();

        await expect(page.locator('.mantine-DateInput-root input')).toHaveValue(
            dayjs(todayDate).format('MMMM D, YYYY'),
        );
        await page.getByTestId('SQL-card-expand').click();
        const textAfterDayFilter = await getMonacoEditorText(page);
        expect(textAfterDayFilter).toContain(
            `(DATE_TRUNC('DAY', "customers".created)) = ('${getLocalISOString(todayDate)}')`,
        );

        // Change date operator
        await page
            .locator('[role="combobox"]')
            .locator('input[value="is"]')
            .click();
        await page.getByRole('option', { name: 'is not' }).click();
        await expect(
            page.locator('[role="combobox"]').locator('input[value="is"]'),
        ).toHaveCount(0);
        await expect(
            page.locator('[role="combobox"]').locator('input[value="is not"]'),
        ).toBeVisible();

        // Keep same date
        await expect(page.locator('.mantine-DateInput-root input')).toHaveValue(
            dayjs(todayDate).format('MMMM D, YYYY'),
        );
        const textAfterOperatorChange = await getMonacoEditorText(page);
        expect(textAfterOperatorChange).toContain(
            `(DATE_TRUNC('DAY', "customers".created)) != ('${getLocalISOString(todayDate)}')`,
        );

        await page.getByTestId('delete-filter-rule-button').click();
    });

    // todo: move to unit test
    test.skip('Should filter by date on dimension', async ({
        adminPage: page,
    }) => {
        const now = dayjs();
        const exploreStateUrlParams = `?create_saved_chart_version=%7B%22tableName%22%3A%22orders%22%2C%22metricQuery%22%3A%7B%22dimensions%22%3A%5B%22orders_order_date_day%22%2C%22orders_order_date_week%22%2C%22orders_order_date_month%22%2C%22orders_order_date_year%22%5D%2C%22metrics%22%3A%5B%5D%2C%22filters%22%3A%7B%7D%2C%22sorts%22%3A%5B%7B%22fieldId%22%3A%22orders_order_date_day%22%2C%22descending%22%3Atrue%7D%5D%2C%22limit%22%3A1%2C%22tableCalculations%22%3A%5B%5D%2C%22additionalMetrics%22%3A%5B%5D%7D%2C%22tableConfig%22%3A%7B%22columnOrder%22%3A%5B%22orders_order_date_day%22%2C%22orders_order_date_week%22%2C%22orders_order_date_month%22%2C%22orders_order_date_year%22%5D%7D%2C%22chartConfig%22%3A%7B%22type%22%3A%22cartesian%22%2C%22config%22%3A%7B%22layout%22%3A%7B%22xField%22%3A%22orders_order_date_day%22%2C%22yField%22%3A%5B%22orders_order_date_week%22%5D%7D%2C%22eChartsConfig%22%3A%7B%22series%22%3A%5B%7B%22encode%22%3A%7B%22xRef%22%3A%7B%22field%22%3A%22orders_order_date_day%22%7D%2C%22yRef%22%3A%7B%22field%22%3A%22orders_order_date_week%22%7D%7D%2C%22type%22%3A%22bar%22%7D%5D%7D%7D%7D%7D`;
        await page.goto(
            `/projects/${SEED_PROJECT.project_uuid}/tables/orders${exploreStateUrlParams}`,
        );

        await page.getByRole('button', { name: 'Run query' }).first().click();
        await expect(page.getByTestId('page-spinner')).toHaveCount(0);
        await page.getByTestId('Chart-card-expand').click(); // Close chart

        await expect(page.getByText('Search Jaffle shop')).toBeVisible(); // Wait until it finishes loading the nav bar
        await expect(page.getByText('Save chart')).toBeVisible(); // Wait until it finishes loading the button
        await page.getByRole('button', { name: 'Run query' }).first().click();
        await expect(page.getByText('Results may be incomplete')).toBeVisible();

        await expect(page.getByText('Filters')).toBeVisible();

        // Open Date dimension
        await page.getByText('Order date').click();

        // Filter by year
        await page.getByTestId('Filters-card-expand').click();
        await page
            .getByTestId('tree-single-node-Year')
            .locator('button')
            .click();

        await page.getByRole('menuitem', { name: 'Add filter' }).click();

        await expect(
            page.getByRole('button', { name: now.format('YYYY') }),
        ).toBeVisible();
        await page.getByTestId('SQL-card-expand').click();

        const textAfterYear = await getMonacoEditorText(page);
        expect(textAfterYear).toContain(
            `(DATE_TRUNC('YEAR', "orders".order_date)) = ('${now.format('YYYY')}-01-01')`,
        );
        await page.getByTestId('delete-filter-rule-button').click();

        // Filter by month
        await page
            .getByTestId('tree-single-node-Month')
            .getByRole('button')
            .click();
        await page.getByRole('menuitem', { name: 'Add filter' }).click();

        await expect(
            page.getByRole('button', { name: now.format('MMMM YYYY') }),
        ).toBeVisible();
        const textAfterMonth = await getMonacoEditorText(page);
        expect(textAfterMonth).toContain(
            `(DATE_TRUNC('MONTH', "orders".order_date)) = ('${now.format('YYYY')}-${now.format('MM')}-01')`,
        );

        await page.getByTestId('delete-filter-rule-button').click();

        // Filter by week
        function startOfTheWeek(): Date {
            const curr = new Date();
            const first = curr.getDate() - curr.getDay();
            return new Date(curr.setDate(first));
        }

        const weekDate = startOfTheWeek();
        await page
            .getByTestId('tree-single-node-Week')
            .getByRole('button')
            .click();
        await page.getByRole('menuitem', { name: 'Add filter' }).click();

        await expect(page.locator('.mantine-DateInput-root input')).toHaveValue(
            dayjs(weekDate).format('MMMM D, YYYY'),
        );
        const textAfterWeek = await getMonacoEditorText(page);
        expect(textAfterWeek).toContain(
            `(DATE_TRUNC('WEEK', "orders".order_date)) = ('${getLocalISOString(weekDate)}')`,
        );

        await page.getByTestId('delete-filter-rule-button').click();

        // Filter by day
        await page
            .getByTestId('tree-single-node-Day')
            .getByRole('button')
            .click();
        await page.getByRole('menuitem', { name: 'Add filter' }).click();

        const todayDate = now.toDate();

        await expect(page.locator('.mantine-DateInput-root input')).toHaveValue(
            dayjs(todayDate).format('MMMM D, YYYY'),
        );
        const textAfterDay = await getMonacoEditorText(page);
        expect(textAfterDay).toContain(
            `(DATE_TRUNC('DAY', "orders".order_date)) = ('${getLocalISOString(todayDate)}')`,
        );

        await page.getByTestId('delete-filter-rule-button').click();
    });

    test.skip('Should filter by datetime on dimension', async ({
        adminPage: page,
    }) => {
        const exploreStateUrlParams = `?create_saved_chart_version={"tableName"%3A"events"%2C"metricQuery"%3A{"dimensions"%3A["events_timestamp_tz_raw"%2C"events_timestamp_tz_millisecond"%2C"events_timestamp_tz_second"%2C"events_timestamp_tz_minute"%2C"events_timestamp_tz_hour"]%2C"metrics"%3A[]%2C"filters"%3A{}%2C"sorts"%3A[{"fieldId"%3A"events_timestamp_tz_raw"%2C"descending"%3Atrue}]%2C"limit"%3A1%2C"tableCalculations"%3A[]%2C"additionalMetrics"%3A[]}%2C"tableConfig"%3A{"columnOrder"%3A["events_timestamp_tz_raw"%2C"events_timestamp_tz_millisecond"%2C"events_timestamp_tz_second"%2C"events_timestamp_tz_minute"%2C"events_timestamp_tz_hour"]}%2C"chartConfig"%3A{"type"%3A"cartesian"%2C"config"%3A{"layout"%3A{"xField"%3A"events_timestamp_tz_raw"%2C"yField"%3A["events_timestamp_tz_millisecond"]}%2C"eChartsConfig"%3A{"series"%3A[{"encode"%3A{"xRef"%3A{"field"%3A"events_timestamp_tz_raw"}%2C"yRef"%3A{"field"%3A"events_timestamp_tz_millisecond"}}%2C"type"%3A"bar"}]}}}}`;
        await page.goto(
            `/projects/${SEED_PROJECT.project_uuid}/tables/events${exploreStateUrlParams}`,
        );

        await page.getByTestId('Filters-card-expand').click();
        await page.getByTestId('SQL-card-expand').click();

        await expect(page.getByText('Loading chart')).toHaveCount(0);

        const checkDatetime = async (sqlFilter: string) => {
            const now = dayjs();
            const aSecondBefore = dayjs().subtract(1, 'seconds'); // Fix millisecond race condition
            const dateString = await page
                .locator('.mantine-DateTimePicker-input input')
                .inputValue();
            const inputDatetimeFormat = 'YYYY-MM-DD, HH:mm:ss:000';
            const expectedDatetimes = [
                now.format(inputDatetimeFormat),
                aSecondBefore.format(inputDatetimeFormat),
            ];
            expect(expectedDatetimes).toContain(dateString);
            const exploreSql = await getMonacoEditorText(page);
            expect(exploreSql).toContain(
                `(${sqlFilter}) = ('${dayjs(dateString).format('YYYY-MM-DD HH:mm:ss')}')`,
            );
        };

        // Open date dimension
        await page.getByText('Timestamp tz').click();

        // Filter by raw
        await page.locator('span:has-text("Raw") ~ div').click();
        await page
            .locator('.bp4-menu > :nth-child(1) > .bp4-menu-item')
            .click();
        await expect(page.locator('.bp4-date-input input')).toBeVisible();
        await checkDatetime('"events".timestamp_tz');
        await page.getByTestId('delete-filter-rule-button').click();

        // Filter by millisecond
        await page.locator('span:has-text("Millisecond") ~ div').click();
        await page
            .locator('.bp4-menu > :nth-child(1) > .bp4-menu-item')
            .click();
        await expect(page.locator('.bp4-date-input input')).toBeVisible();
        await checkDatetime(`DATE_TRUNC('MILLISECOND', "events".timestamp_tz)`);
        await page.getByTestId('delete-filter-rule-button').click();

        // Filter by second
        await page.locator('span:has-text("Second") ~ div').click();
        await page
            .locator('.bp4-menu > :nth-child(1) > .bp4-menu-item')
            .click();
        await expect(page.locator('.bp4-date-input input')).toBeVisible();
        await checkDatetime(`DATE_TRUNC('SECOND', "events".timestamp_tz)`);
        await page.getByTestId('delete-filter-rule-button').click();

        // Filter by minute
        await page.locator('span:has-text("Minute") ~ div').click();
        await page
            .locator('.bp4-menu > :nth-child(1) > .bp4-menu-item')
            .click();
        await expect(page.locator('.bp4-date-input input')).toBeVisible();
        await checkDatetime(`DATE_TRUNC('MINUTE', "events".timestamp_tz)`);
        await page.getByTestId('delete-filter-rule-button').click();

        // Filter by hour
        await page.locator('span:has-text("Hour") ~ div').click();
        await page
            .locator('.bp4-menu > :nth-child(1) > .bp4-menu-item')
            .click();
        await expect(page.locator('.bp4-date-input input')).toBeVisible();
        await checkDatetime(`DATE_TRUNC('HOUR', "events".timestamp_tz)`);
        await page.getByTestId('delete-filter-rule-button').click();
    });
});
