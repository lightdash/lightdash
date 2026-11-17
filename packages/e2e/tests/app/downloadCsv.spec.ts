import { SEED_PROJECT } from '@lightdash/common';
import {
    expect,
    loginAs,
    scrollTreeToItem,
    SEED_USERS,
    test,
    type Locator,
    type Page,
} from '../../support/test';

type JobStatusBody = {
    results?: {
        status?: string;
        details?: { fileUrl?: string; error?: string };
    };
};

// Clicks the export button, then waits for the schedule request and polls until the job is done.
const waitForDownloadToComplete = async (
    page: Page,
    projectUuid: string,
    exportButton: Locator,
    { timeout = 10_000, maxPolls = 15, pollInterval = 1_000 } = {},
) => {
    const schedulePromise = page.waitForResponse(
        (response) =>
            response.request().method() === 'POST' &&
            response.url().includes(`/api/v2/projects/${projectUuid}/query/`) &&
            response.url().endsWith('/schedule-download'),
        { timeout },
    );
    // Non-OK polls and polls without a status are ignored, like retries in the old test.
    const finishedPollPromise = page.waitForResponse(
        async (response) => {
            if (
                response.request().method() !== 'GET' ||
                !/\/api\/v1\/schedulers\/job\/[^/]+\/status/.test(
                    response.url(),
                ) ||
                (response.status() !== 200 && response.status() !== 304)
            ) {
                return false;
            }
            const body = (await response
                .json()
                .catch(() => null)) as JobStatusBody | null;
            const status = body?.results?.status;
            return status === 'completed' || status === 'error';
        },
        { timeout: timeout + maxPolls * pollInterval * 3 },
    );

    await exportButton.click();

    const scheduleResponse = await schedulePromise;
    expect(scheduleResponse.status()).toBe(200);
    const scheduleBody = (await scheduleResponse.json()) as {
        results: { jobId?: string };
    };
    expect(scheduleBody.results).toHaveProperty('jobId');

    const pollBody = (await (
        await finishedPollPromise
    ).json()) as JobStatusBody;
    const jobStatus = pollBody.results;
    expect(
        jobStatus?.status,
        `Job failed: ${jobStatus?.details?.error || 'Unknown error'}`,
    ).toBe('completed');
    expect(jobStatus?.details).toHaveProperty('fileUrl');
};

// With Google Drive configured the export popover opens on a CSV/Sheets chooser first.
const chooseCsvIfGoogleDriveEnabled = async (
    page: Page,
    exportButton: Locator,
) => {
    const chooser = page.getByTestId('chart-export-csv-button');
    await expect(exportButton.or(chooser)).toBeVisible();
    if (await chooser.isVisible()) await chooser.click();
};

// todo: remove
test.describe.skip('Download CSV on Dashboards', () => {
    test.beforeEach(async ({ page, api }) => {
        await loginAs(api.raw, SEED_USERS.admin);
        await page.goto(`/projects/${SEED_PROJECT.project_uuid}/dashboards`, {
            timeout: 60_000,
        });
    });

    test('Should download a CSV from dashboard', async ({ page }) => {
        // wait for the dashboard to load
        await expect(page.getByText('Loading dashboards')).toHaveCount(0);

        await page.getByRole('link', { name: 'Jaffle dashboard' }).click();

        await expect(page.getByTestId('page-spinner')).toHaveCount(0);

        await expect(page.getByText('No chart available')).toHaveCount(0);
        await expect(page.getByText('No data available')).toHaveCount(0);

        await expect(page.locator('thead th')).toHaveCount(6); // Table chart
        await page.getByText('Days since').first().hover();

        await page.getByTestId('tile-icon-more').click();
        await page.getByRole('button', { name: 'Download data' }).click();

        const exportButton = page.getByTestId('chart-export-results-button');
        await expect(exportButton).toBeVisible();

        // Wait for download to complete (schedule and poll)
        await waitForDownloadToComplete(
            page,
            SEED_PROJECT.project_uuid,
            exportButton,
        );
    });
});

test.describe('Download CSV on Explore', () => {
    test.beforeEach(async ({ page, api }) => {
        await loginAs(api.raw, SEED_USERS.admin);
        await page.goto(`/projects/${SEED_PROJECT.project_uuid}/tables`, {
            timeout: 60_000,
        });

        await expect(page.getByTestId('page-spinner')).toHaveCount(0);
    });

    test('Should download CSV from results on Explore', async ({ page }) => {
        // choose table and select fields
        await page.getByText('Orders', { exact: true }).click();
        await expect(
            page.getByText('Order date', { exact: true }).first(),
        ).toBeVisible(); // Wait for Orders table columns to appear
        await (await scrollTreeToItem(page, 'Order Customer')).click();
        await (await scrollTreeToItem(page, 'First name')).click();
        await (await scrollTreeToItem(page, 'Unique order count')).click();

        // run query
        await page.getByRole('button', { name: 'Run query' }).first().click();

        // wait for the chart to finish loading
        await expect(page.getByText('Loading chart')).toHaveCount(0);
        await expect(page.getByText('Loading results')).toHaveCount(0);
        if ((await page.getByTestId('export-csv-button').count()) > 1) {
            // close chart section
            await page.getByTestId('Chart-card-expand').click();
        }

        // Click export button (opens popover)
        await page.getByTestId('export-csv-button').click();

        // Wait for popover to open and ensure download button is ready
        const exportButton = page.getByTestId('chart-export-results-button');
        await chooseCsvIfGoogleDriveEnabled(page, exportButton);
        await expect(exportButton).toBeVisible();
        await expect(exportButton).toBeEnabled();

        // Intercepts are set up inside the helper before clicking
        await waitForDownloadToComplete(
            page,
            SEED_PROJECT.project_uuid,
            exportButton,
        );
    });

    // todo: remove
    test.skip('Should download CSV from table chart on Explore', async ({
        page,
    }) => {
        await expect(page.getByTestId('page-spinner')).toHaveCount(0);

        // choose table and select fields
        await page.getByText('Orders', { exact: true }).click();
        await expect(
            page.getByText('Order date', { exact: true }).first(),
        ).toBeVisible(); // Wait for Orders table columns to appear
        await (await scrollTreeToItem(page, 'Order Customer')).click();
        await (await scrollTreeToItem(page, 'First name')).click();
        await (await scrollTreeToItem(page, 'Unique order count')).click();

        // run query
        await page.getByRole('button', { name: 'Run query' }).first().click();

        // wait for chart to be expanded and configure button to be available, then change chart type to Table
        if ((await page.getByText('Configure').count()) === 0) {
            // open chart section if closed
            await page.getByTestId('Chart-card-expand').click();
        }
        await page.getByText('Configure').click();
        await page.getByRole('button', { name: 'Bar chart' }).click();
        await page.getByRole('menuitem', { name: 'Table' }).click();
        await page.getByTestId('export-csv-button').first().click();

        // Wait for download to complete (schedule and poll)
        await waitForDownloadToComplete(
            page,
            SEED_PROJECT.project_uuid,
            page.getByTestId('chart-export-results-button'),
        );
    });
});
