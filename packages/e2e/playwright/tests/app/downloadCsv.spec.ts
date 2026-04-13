import { SEED_PROJECT } from '@lightdash/common';
import { expect, test } from '../../fixtures';
import { scrollTreeToItem } from '../../helpers';

// todo: remove
test.describe.skip('Download CSV on Dashboards', () => {
    test('Should download a CSV from dashboard', async ({
        adminPage: page,
    }) => {
        await page.goto(`/projects/${SEED_PROJECT.project_uuid}/dashboards`, {
            timeout: 60000,
        });

        // wait for the dashboard to load
        await expect(page.getByText('Loading dashboards')).toHaveCount(0);

        await page.getByRole('link', { name: 'Jaffle dashboard' }).click();

        await expect(page.getByTestId('page-spinner')).toHaveCount(0);

        await expect(page.getByText('No chart available')).toHaveCount(0);
        await expect(page.getByText('No data available')).toHaveCount(0);

        await expect(page.locator('thead th')).toHaveCount(6); // Table chart
        await page.getByText('Days since').hover();

        await page.getByTestId('tile-icon-more').click();
        await page.getByRole('button', { name: 'Download data' }).click();

        await expect(
            page.getByTestId('chart-export-results-button'),
        ).toBeVisible();

        // Click export results button and wait for download to schedule
        const schedulePromise = page.waitForResponse(
            (resp) =>
                resp.url().includes('/schedule-download') &&
                resp.request().method() === 'POST',
        );
        await page.getByTestId('chart-export-results-button').click();

        const scheduleResp = await schedulePromise;
        expect(scheduleResp.status()).toBe(200);
        const scheduleBody = await scheduleResp.json();
        expect(scheduleBody.results).toHaveProperty('jobId');

        // Poll for job completion
        await expect(async () => {
            const pollResp = await page.waitForResponse(
                (resp) =>
                    resp.url().includes('/schedulers/job/') &&
                    resp.url().includes('/status') &&
                    resp.request().method() === 'GET',
                { timeout: 3000 },
            );
            const pollBody = await pollResp.json();
            expect(pollBody.results.status).toBe('completed');
            expect(pollBody.results.details).toHaveProperty('fileUrl');
        }).toPass({ timeout: 30000 });
    });
});

test.describe('Download CSV on Explore', () => {
    test('Should download CSV from results on Explore', async ({
        adminPage: page,
    }) => {
        await page.goto(`/projects/${SEED_PROJECT.project_uuid}/tables`, {
            timeout: 60000,
        });

        await expect(page.getByTestId('page-spinner')).toHaveCount(0);

        // choose table and select fields
        await page.getByText('Orders').click();
        await expect(page.getByText('Order date')).toBeVisible(); // Wait for Orders table columns to appear
        await scrollTreeToItem(page, 'Order Customer');
        await page.getByText('Order Customer').click();
        await scrollTreeToItem(page, 'First name');
        await page.getByText('First name').click();
        await scrollTreeToItem(page, 'Unique order count');
        await page.getByText('Unique order count').click();

        // run query
        await page.getByRole('button', { name: 'Run query' }).click();

        // wait for the chart to finish loading
        await expect(page.getByText('Loading chart')).toHaveCount(0);
        await expect(page.getByText('Loading results')).toHaveCount(0);

        // close chart section if there are multiple export buttons
        const exportButtons = page.getByTestId('export-csv-button');
        if ((await exportButtons.count()) > 1) {
            await page.getByTestId('Chart-card-expand').click();
        }

        // Click export button (opens popover)
        await page.getByTestId('export-csv-button').click();

        // Wait for popover to open and ensure download button is ready
        await expect(
            page.getByTestId('chart-export-results-button'),
        ).toBeVisible();
        await expect(
            page.getByTestId('chart-export-results-button'),
        ).toBeEnabled();

        // Set up response listener and click
        const schedulePromise = page.waitForResponse(
            (resp) =>
                resp.url().includes('/schedule-download') &&
                resp.request().method() === 'POST',
        );
        await page.getByTestId('chart-export-results-button').click();

        // Wait for schedule request
        const scheduleResp = await schedulePromise;
        expect(scheduleResp.status()).toBe(200);
        const scheduleBody = await scheduleResp.json();
        expect(scheduleBody.results).toHaveProperty('jobId');

        // Poll for job completion
        await expect(async () => {
            const pollResp = await page.waitForResponse(
                (resp) =>
                    resp.url().includes('/schedulers/job/') &&
                    resp.url().includes('/status') &&
                    resp.request().method() === 'GET',
                { timeout: 3000 },
            );
            const pollBody = await pollResp.json();
            expect(pollBody.results.status).toBe('completed');
            expect(pollBody.results.details).toHaveProperty('fileUrl');
        }).toPass({ timeout: 30000 });
    });

    // todo: remove
    test.skip('Should download CSV from table chart on Explore', async ({
        adminPage: page,
    }) => {
        await page.goto(`/projects/${SEED_PROJECT.project_uuid}/tables`, {
            timeout: 60000,
        });

        await expect(page.getByTestId('page-spinner')).toHaveCount(0);

        // choose table and select fields
        await page.getByText('Orders').click();
        await expect(page.getByText('Order date')).toBeVisible(); // Wait for Orders table columns to appear
        await scrollTreeToItem(page, 'Order Customer');
        await page.getByText('Order Customer').click();
        await scrollTreeToItem(page, 'First name');
        await page.getByText('First name').click();
        await scrollTreeToItem(page, 'Unique order count');
        await page.getByText('Unique order count').click();

        // run query
        await page.getByRole('button', { name: 'Run query' }).click();

        // wait for chart to be expanded and configure button to be available, then change chart type to Table
        const configureText = page.getByText('Configure');
        if (!(await configureText.isVisible())) {
            // open chart section if closed
            await page.getByTestId('Chart-card-expand').click();
        }
        await page.getByText('Configure').click();
        await page.getByRole('button', { name: 'Bar chart' }).click();
        await page.getByRole('menuitem', { name: 'Table' }).click();
        await page.getByTestId('export-csv-button').first().click();

        // Set up response listener and click
        const schedulePromise = page.waitForResponse(
            (resp) =>
                resp.url().includes('/schedule-download') &&
                resp.request().method() === 'POST',
        );
        await page.getByTestId('chart-export-results-button').click();

        const scheduleResp = await schedulePromise;
        expect(scheduleResp.status()).toBe(200);
        const scheduleBody = await scheduleResp.json();
        expect(scheduleBody.results).toHaveProperty('jobId');

        // Poll for job completion
        await expect(async () => {
            const pollResp = await page.waitForResponse(
                (resp) =>
                    resp.url().includes('/schedulers/job/') &&
                    resp.url().includes('/status') &&
                    resp.request().method() === 'GET',
                { timeout: 3000 },
            );
            const pollBody = await pollResp.json();
            expect(pollBody.results.status).toBe('completed');
            expect(pollBody.results.details).toHaveProperty('fileUrl');
        }).toPass({ timeout: 30000 });
    });
});
