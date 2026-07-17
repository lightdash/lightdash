import { SEED_PROJECT } from '@lightdash/common';
import { expect, test, type Locator } from '@playwright/test';
import { stat } from 'fs/promises';

const selectTreeItem = async (container: Locator, label: string) => {
    const item = container.getByText(label, { exact: true });
    const waitForTreeRender = () =>
        container.evaluate(
            () =>
                new Promise<void>((resolve) => {
                    requestAnimationFrame(() => {
                        requestAnimationFrame(() => resolve());
                    });
                }),
        );

    await expect(container).toBeVisible();
    await container.evaluate((element) => {
        element.scrollTo({ top: 0 });
    });
    await waitForTreeRender();

    await expect
        .poll(
            async () => {
                if (await item.isVisible()) {
                    await waitForTreeRender();
                    if (!(await item.isVisible())) return false;

                    await item.click();
                    await waitForTreeRender();
                    return true;
                }

                await container.evaluate((element) => {
                    const maximumScrollTop =
                        element.scrollHeight - element.clientHeight;
                    element.scrollTo({
                        top: Math.min(
                            element.scrollTop + element.clientHeight / 2,
                            maximumScrollTop,
                        ),
                    });
                });

                return false;
            },
            {
                message: `Expected ${label} to appear in the Explore tree`,
                timeout: 10_000,
                intervals: [200],
            },
        )
        .toBe(true);
};

test('admin can download CSV results from Explore', async ({
    page,
}, testInfo) => {
    test.setTimeout(90_000);

    await page.goto(`/projects/${SEED_PROJECT.project_uuid}/tables`, {
        timeout: 60_000,
    });
    await expect(page.getByTestId('page-spinner')).not.toBeAttached({
        timeout: 60_000,
    });

    await page.getByText('Orders', { exact: true }).click();

    const tree = page.getByTestId('virtualized-tree-scroll-container');
    await expect(tree.getByText('Order date', { exact: true })).toBeVisible();
    await selectTreeItem(tree, 'Order Customer');
    await selectTreeItem(tree, 'First name');
    await selectTreeItem(tree, 'Unique order count');

    const runQueryButtons = page.getByRole('button', { name: /^Run query/ });
    const exploreToolbar = page
        .locator('.mantine-8-Group-root')
        .filter({
            has: page.getByRole('button', {
                name: 'Refresh dbt',
                exact: true,
            }),
        })
        .filter({ has: runQueryButtons });
    await expect(exploreToolbar).toHaveCount(1);
    const runQueryButton = exploreToolbar.getByRole('button', {
        name: /^Run query/,
    });
    await expect(runQueryButton).toHaveCount(1);
    await runQueryButton.click();
    await expect(page.getByText('Loading chart', { exact: true })).toHaveCount(
        0,
        { timeout: 30_000 },
    );
    await expect(
        page.getByText('Loading results', { exact: true }),
    ).toHaveCount(0, { timeout: 30_000 });

    const resultsHeading = page.getByRole('heading', {
        name: 'Results',
        exact: true,
    });
    const resultsCard = page
        .locator('.mantine-8-Card-root')
        .filter({ has: resultsHeading });
    await expect(resultsCard).toHaveCount(1);

    const exportButton = resultsCard.getByTestId('export-csv-button');
    await expect(exportButton).toHaveCount(1);
    await expect(exportButton).toBeVisible();
    await expect(exportButton).toBeEnabled();
    await exportButton.click();

    const exportDialog = page.getByRole('dialog');
    await expect(exportDialog).toHaveCount(1);
    await expect(exportDialog).toBeVisible();
    const downloadDataButton = exportDialog.getByRole('button', {
        name: 'Download data',
        exact: true,
    });
    if (await downloadDataButton.isVisible()) {
        await downloadDataButton.click();
    }

    const downloadButton = exportDialog.getByRole('button', {
        name: 'Download',
        exact: true,
    });
    await expect(downloadButton).toBeVisible();
    await expect(downloadButton).toBeEnabled();

    const scheduleDownloadPath = new RegExp(
        `^/api/v2/projects/${SEED_PROJECT.project_uuid}/query/[^/]+/schedule-download$`,
    );
    const [scheduleResponse, download] = await Promise.all([
        page.waitForResponse(
            (response) =>
                response.request().method() === 'POST' &&
                scheduleDownloadPath.test(new URL(response.url()).pathname),
            { timeout: 60_000 },
        ),
        page.waitForEvent('download', { timeout: 60_000 }),
        downloadButton.click(),
    ]);

    expect(scheduleResponse.status()).toBe(200);
    const scheduleResponseBody: unknown = await scheduleResponse.json();
    expect(scheduleResponseBody).toEqual(
        expect.objectContaining({
            results: expect.objectContaining({
                jobId: expect.stringMatching(/\S/),
            }),
        }),
    );

    expect(download.suggestedFilename()).toMatch(/\.csv$/i);
    const downloadPath = testInfo.outputPath('explore-results.csv');
    await download.saveAs(downloadPath);
    expect((await stat(downloadPath)).size).toBeGreaterThan(0);
});
