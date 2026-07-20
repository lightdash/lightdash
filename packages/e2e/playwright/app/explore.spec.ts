import { SEED_PROJECT } from '@lightdash/common';
import {
    expect,
    test,
    type APIRequestContext,
    type Locator,
    type Page,
} from '@playwright/test';
import { randomUUID } from 'node:crypto';

const AUTO_FETCH_STORAGE_KEY = 'lightdash-explorer-auto-fetch-enabled';
const METRIC_QUERY_PATH = `/api/v2/projects/${SEED_PROJECT.project_uuid}/query/metric-query`;
const SAVED_CHART_PATH = `/api/v1/projects/${SEED_PROJECT.project_uuid}/saved`;
const UUID_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const waitForVirtualizedTreeRender = async (container: Locator) => {
    await container.evaluate(async () => {
        await new Promise<void>((resolve) => {
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        });
    });
};

const scrollTreeToItem = async (container: Locator, itemName: string) => {
    await container.evaluate((element) => {
        if (!(element instanceof HTMLElement)) {
            throw new Error('Explore tree scroll container must be an element');
        }
        const scrollContainer = element;
        scrollContainer.scrollTop = 0;
    });
    await waitForVirtualizedTreeRender(container);

    const item = container.getByText(itemName, { exact: true });
    const findRenderedItem = async (): Promise<Locator> => {
        const matches = await item.count();
        if (matches === 1) {
            await expect(item).toBeVisible();
            return item;
        }
        if (matches > 1) {
            throw new Error(`Explore tree item "${itemName}" is not unique`);
        }

        const didScroll = await container.evaluate((element) => {
            if (!(element instanceof HTMLElement)) {
                throw new Error(
                    'Explore tree scroll container must be an element',
                );
            }

            const scrollContainer = element;
            const maximumScrollTop =
                scrollContainer.scrollHeight - scrollContainer.clientHeight;
            if (scrollContainer.scrollTop >= maximumScrollTop) return false;

            scrollContainer.scrollTop = Math.min(
                scrollContainer.scrollTop + scrollContainer.clientHeight / 2,
                maximumScrollTop,
            );
            return true;
        });

        if (!didScroll) {
            throw new Error(`Could not find Explore tree item "${itemName}"`);
        }
        await waitForVirtualizedTreeRender(container);
        return findRenderedItem();
    };

    return findRenderedItem();
};

const getRunQueryButton = async (page: Page) => {
    const button = page.getByTestId('RefreshButton/RunQueryButton');
    await expect(button).toHaveCount(1);
    return button;
};

const waitForMetricQueryAfter = async (
    page: Page,
    action: () => Promise<void>,
) => {
    const responsePromise = page.waitForResponse(
        (response) =>
            response.request().method() === 'POST' &&
            new URL(response.url()).pathname === METRIC_QUERY_PATH,
    );

    await action();
    const response = await responsePromise;
    expect(response.ok()).toBe(true);

    const runQueryButton = await getRunQueryButton(page);
    await expect(runQueryButton).toBeEnabled();
    await expect(
        page.getByText('Loading results', { exact: true }),
    ).toBeHidden();
};

const navigateToOrders = async (page: Page) => {
    await page.addInitScript((storageKey) => {
        window.localStorage.setItem(storageKey, 'true');
    }, AUTO_FETCH_STORAGE_KEY);
    await page.goto(`/projects/${SEED_PROJECT.project_uuid}/tables/orders`);

    const tree = page.getByTestId('virtualized-tree-scroll-container');
    await expect(tree).toBeVisible();
    await expect(tree.getByText('Dimensions', { exact: true })).toBeVisible();
    return tree;
};

const expandTreeGroup = async (tree: Locator, groupName: string) => {
    const group = await scrollTreeToItem(tree, groupName);
    await group.click();
};

const selectField = async (page: Page, tree: Locator, fieldName: string) => {
    const field = await scrollTreeToItem(tree, fieldName);
    await waitForMetricQueryAfter(page, () => field.click());
};

const openResultColumnMenu = async (page: Page, columnName: string) => {
    const results = page.getByTestId('results-table-container');
    const columnHeader = results.getByRole('cell', {
        name: `${columnName} Context menu`,
        exact: true,
    });
    await expect(columnHeader).toHaveCount(1);
    await columnHeader
        .getByRole('button', { name: 'Context menu', exact: true })
        .click();
};

const runQuery = async (page: Page) => {
    const runQueryButton = await getRunQueryButton(page);
    await expect(runQueryButton).toBeEnabled();
    await waitForMetricQueryAfter(page, () => runQueryButton.click());

    const firstResultRow = page
        .getByTestId('results-table-container')
        .locator('tbody')
        .getByRole('row')
        .first();
    await expect(firstResultRow).toBeVisible();
};

const parseCreatedChartUuid = (responseBody: unknown) => {
    if (
        typeof responseBody !== 'object' ||
        responseBody === null ||
        Reflect.get(responseBody, 'status') !== 'ok'
    ) {
        throw new Error('Chart creation returned an invalid response');
    }

    const results = Reflect.get(responseBody, 'results');
    if (typeof results !== 'object' || results === null) {
        throw new Error('Chart creation response has no results');
    }

    const uuid = Reflect.get(results, 'uuid');
    if (typeof uuid !== 'string' || !UUID_PATTERN.test(uuid)) {
        throw new Error('Chart creation response has no valid UUID');
    }
    return uuid;
};

const cleanupChart = async (request: APIRequestContext, chartUuid: string) => {
    try {
        const deleteResponse = await request.delete(
            `/api/v2/projects/${SEED_PROJECT.project_uuid}/saved/${chartUuid}`,
        );
        if (![200, 404].includes(deleteResponse.status())) {
            return `Chart cleanup returned ${deleteResponse.status()}`;
        }

        const getResponse = await request.get(
            `/api/v2/projects/${SEED_PROJECT.project_uuid}/saved/${chartUuid}`,
        );
        if (getResponse.status() !== 404) {
            return `Deleted chart remained active with status ${getResponse.status()}`;
        }
        return null;
    } catch (error: unknown) {
        return error instanceof Error
            ? error.message
            : 'Chart cleanup failed with an unknown error';
    }
};

const configureChartType = async (page: Page, chartType: string) => {
    const chartTypeButton = page.getByTestId('VisualizationCardOptions');
    await chartTypeButton.click();

    const menu = page.getByRole('menu');
    await expect(menu).toBeVisible();
    await menu.getByRole('menuitem', { name: chartType, exact: true }).click();
    await expect(chartTypeButton).toHaveText(chartType);
};

test('Should query orders', async ({ page }) => {
    const tree = await navigateToOrders(page);
    await expandTreeGroup(tree, 'Order Customer');
    await selectField(page, tree, 'Unique order count');
    await selectField(page, tree, 'First name');

    await openResultColumnMenu(page, 'Order Customer First name');
    await waitForMetricQueryAfter(page, () =>
        page.getByRole('menuitem', { name: 'Sort A-Z', exact: true }).click(),
    );
    await runQuery(page);

    const firstResultRow = page
        .getByTestId('results-table-container')
        .locator('tbody')
        .getByRole('row')
        .first();
    await expect(
        firstResultRow.getByRole('cell', { name: 'Aaron', exact: true }),
    ).toHaveCount(1);
});

test(
    'Should save chart',
    { tag: '@mutating' },
    async ({ page, request }, testInfo) => {
        const chartName = `pw-explore-${randomUUID()}`;
        let createdChartUuid: string | null = null;
        let testOutcome:
            | { status: 'passed' }
            | { status: 'failed'; error: unknown } = { status: 'passed' };
        let cleanupFailure: string | null = null;

        try {
            const tree = await navigateToOrders(page);
            await expandTreeGroup(tree, 'Order Customer');
            await selectField(page, tree, 'First name');
            await selectField(page, tree, 'Unique order count');

            await page.getByTestId('Chart-card-expand').click();
            await expect(page.getByTestId('visualization')).toBeVisible();
            await page
                .getByRole('button', { name: 'Save chart', exact: true })
                .click();

            const saveDialog = page.getByRole('dialog');
            await expect(saveDialog).toBeVisible();
            await saveDialog
                .getByTestId('ChartCreateModal/NameInput')
                .fill(chartName);
            await saveDialog
                .getByRole('button', { name: 'Next', exact: true })
                .click();

            const createResponsePromise = page.waitForResponse(
                (response) =>
                    response.request().method() === 'POST' &&
                    new URL(response.url()).pathname === SAVED_CHART_PATH,
            );
            await saveDialog
                .getByRole('button', { name: 'Save', exact: true })
                .click();
            const createResponse = await createResponsePromise;
            expect(createResponse.ok()).toBe(true);
            const createResponseBody: unknown = await createResponse.json();
            createdChartUuid = parseCreatedChartUuid(createResponseBody);

            await expect(
                page.getByText('Success! Chart was saved.', { exact: true }),
            ).toBeVisible();
            await expect(page).toHaveURL(
                `/projects/${SEED_PROJECT.project_uuid}/saved/${createdChartUuid}/view`,
            );
            await expect(
                page.getByText('Loading chart', { exact: true }),
            ).toBeHidden();

            await page
                .getByRole('button', { name: 'Edit chart', exact: true })
                .click();
            await expect(page).toHaveURL(
                `/projects/${SEED_PROJECT.project_uuid}/saved/${createdChartUuid}/edit`,
            );
            await page
                .getByRole('button', { name: 'Configure', exact: true })
                .click();
            await expect(
                page.getByTestId('VisualizationCardOptions'),
            ).toHaveText('Bar chart');
            await configureChartType(page, 'Horizontal bar chart');

            const versionResponsePromise = page.waitForResponse(
                (response) =>
                    response.request().method() === 'POST' &&
                    new URL(response.url()).pathname ===
                        `/api/v1/saved/${createdChartUuid}/version`,
            );
            await page
                .getByRole('button', { name: 'Save changes', exact: true })
                .click();
            const versionResponse = await versionResponsePromise;
            expect(versionResponse.ok()).toBe(true);
            await expect(
                page.getByText('Success! Chart was updated.', { exact: true }),
            ).toBeVisible();
        } catch (error: unknown) {
            testOutcome = { status: 'failed', error };
        } finally {
            if (createdChartUuid !== null) {
                cleanupFailure = await cleanupChart(request, createdChartUuid);
            }
        }

        if (testOutcome.status === 'failed') {
            if (cleanupFailure !== null) {
                testInfo.annotations.push({
                    type: 'cleanup-failure',
                    description: cleanupFailure,
                });
            }
            throw testOutcome.error;
        }
        if (cleanupFailure !== null) {
            throw new Error(cleanupFailure);
        }
    },
);

test('Should change chart config type', async ({ page }) => {
    const tree = await navigateToOrders(page);
    await expandTreeGroup(tree, 'Order Customer');
    await selectField(page, tree, 'First name');
    await selectField(page, tree, 'Unique order count');

    const results = page.getByTestId('results-table-container');
    await expect(
        results.getByRole('cell', {
            name: 'Order Customer First name Context menu',
            exact: true,
        }),
    ).toHaveCount(1);
    await expect(
        results.getByRole('cell', {
            name: 'Orders Unique order count Context menu',
            exact: true,
        }),
    ).toHaveCount(1);
    await runQuery(page);

    await page.getByTestId('Chart-card-expand').click();
    await expect(page.getByTestId('visualization')).toBeVisible();
    await expect(page.getByText('Loading chart', { exact: true })).toBeHidden();
    await page.getByRole('button', { name: 'Configure', exact: true }).click();

    await [
        'Bar chart',
        'Horizontal bar chart',
        'Line chart',
        'Area chart',
        'Scatter chart',
        'Pie chart',
        'Table',
        'Big value',
    ].reduce(async (previousSelection, chartType) => {
        await previousSelection;
        await configureChartType(page, chartType);
    }, Promise.resolve());
});
