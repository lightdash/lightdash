import { ChartKind, SEED_PROJECT } from '@lightdash/common';
import {
    expect,
    test,
    type APIRequestContext,
    type APIResponse,
    type Response as BrowserResponse,
    type Page,
} from '@playwright/test';

const projectUuid = SEED_PROJECT.project_uuid;
const savedSqlApiPath = `/api/v1/projects/${projectUuid}/sqlRunner/saved`;
const runSqlApiPath = `/api/v2/projects/${projectUuid}/query/sql`;
const runSavedSqlApiPath = `/api/v2/projects/${projectUuid}/query/sql-chart`;
const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const requireRecord = (value: unknown, description: string) => {
    if (!isRecord(value)) {
        throw new Error(`${description} must be an object`);
    }

    return value;
};

const parseJsonText = (text: string, description: string) => {
    try {
        const value: unknown = JSON.parse(text);
        return value;
    } catch (error) {
        const details = error instanceof Error ? `: ${error.message}` : '';
        throw new Error(`${description} returned invalid JSON${details}`);
    }
};

const parseOkResults = (value: unknown, description: string) => {
    const payload = requireRecord(value, description);

    if (payload.status !== 'ok') {
        throw new Error(`${description} did not return an ok status`);
    }

    return requireRecord(payload.results, `${description} results`);
};

const parseApiOkResults = async (response: APIResponse, description: string) =>
    parseOkResults(
        parseJsonText(await response.text(), description),
        description,
    );

const parseBrowserOkResults = async (
    response: BrowserResponse,
    description: string,
) =>
    parseOkResults(
        parseJsonText(await response.text(), description),
        description,
    );

const parseCatalogDatabase = async (response: APIResponse) => {
    const catalog = await parseApiOkResults(response, 'SQL Runner catalog');
    const firstDatabase = Object.entries(catalog).at(0);

    if (firstDatabase === undefined) {
        throw new Error('SQL Runner catalog must contain a database');
    }

    const [database, schemasValue] = firstDatabase;
    const schemas = requireRecord(schemasValue, `Database ${database}`);
    const jaffle = requireRecord(schemas.jaffle, 'Schema jaffle');
    requireRecord(jaffle.customers, 'Table jaffle.customers');
    requireRecord(jaffle.orders, 'Table jaffle.orders');

    return database;
};

const parseCreatedSavedSql = async (response: BrowserResponse) => {
    const results = await parseBrowserOkResults(
        response,
        'Create saved SQL chart',
    );
    const { savedSqlUuid, slug } = results;

    if (typeof savedSqlUuid !== 'string' || !uuidPattern.test(savedSqlUuid)) {
        throw new Error('Create saved SQL chart returned an invalid UUID');
    }

    if (typeof slug !== 'string' || slug.length === 0) {
        throw new Error('Create saved SQL chart returned an invalid slug');
    }

    return { savedSqlUuid, slug };
};

const verifyUpdatedSavedSql = async (
    response: BrowserResponse,
    expectedSavedSqlUuid: string,
) => {
    const results = await parseBrowserOkResults(
        response,
        'Update saved SQL chart',
    );
    const { savedSqlUuid, savedSqlVersionUuid } = results;

    if (savedSqlUuid !== expectedSavedSqlUuid) {
        throw new Error('Update saved SQL chart returned an unexpected UUID');
    }

    if (
        typeof savedSqlVersionUuid !== 'string' ||
        !uuidPattern.test(savedSqlVersionUuid)
    ) {
        throw new Error(
            'Update saved SQL chart returned an invalid version UUID',
        );
    }
};

const responseMatches = (
    response: BrowserResponse,
    method: 'POST' | 'PATCH',
    pathname: string,
) =>
    response.request().method() === method &&
    new URL(response.url()).pathname === pathname;

const getRunQueryButton = (page: Page) =>
    page.getByRole('button', { name: /^Run query(?: \(\d+\))?$/ });

const selectEditorView = async (page: Page, name: 'Chart' | 'SQL') => {
    const group = page.getByRole('radiogroup').filter({
        has: page.getByRole('radio', { name, exact: true }),
    });
    await expect(group).toHaveCount(1);
    await group.getByText(name, { exact: true }).click();
};

const getMonacoEditor = (page: Page) => page.locator('.monaco-editor');

const getMonacoEditorInput = (page: Page) =>
    getMonacoEditor(page).getByRole('textbox', {
        name: /^Editor content;/,
    });

const expectMonacoSql = async (page: Page, sql: string) => {
    await expect(getMonacoEditor(page)).toBeVisible();
    await expect(getMonacoEditorInput(page)).toHaveValue(sql);
};

const replaceMonacoSql = async (page: Page, sql: string) => {
    const editor = getMonacoEditor(page);
    const editorInput = getMonacoEditorInput(page);
    await expect(editor).toBeVisible();
    await editor.locator('.view-line').click();
    await expect(editorInput).toBeFocused();
    await page.keyboard.press('End');
    await page.keyboard.press('Shift+Home');
    await page.keyboard.press('Backspace');
    await expect(editorInput).toHaveValue('');
    await page.keyboard.insertText(sql);
    await expectMonacoSql(page, sql);
};

const runSqlAndWaitForColumn = async (page: Page, columnName: string) => {
    const runResponsePromise = page.waitForResponse((response) =>
        responseMatches(response, 'POST', runSqlApiPath),
    );

    await getRunQueryButton(page).click();

    const runResponse = await runResponsePromise;
    expect(runResponse.ok()).toBe(true);
    await expect(
        page
            .locator('#sql-runner-panel-results thead')
            .getByText(columnName, { exact: true }),
    ).toBeVisible();
};

const waitForSavedSqlQuery = (page: Page) =>
    page.waitForResponse((response) =>
        responseMatches(response, 'POST', runSavedSqlApiPath),
    );

const cleanupSavedSql = async (
    request: APIRequestContext,
    savedSqlUuid: string,
) => {
    const exactSavedSqlPath = `${savedSqlApiPath}/${savedSqlUuid}`;
    const deleteResponse = await request.delete(exactSavedSqlPath);

    if (deleteResponse.status() !== 200 && deleteResponse.status() !== 404) {
        throw new Error(
            `Saved SQL cleanup failed with status ${deleteResponse.status()}`,
        );
    }

    const verificationResponse = await request.get(exactSavedSqlPath);
    if (verificationResponse.status() !== 404) {
        throw new Error(
            `Saved SQL ${savedSqlUuid} remained active after cleanup: ${verificationResponse.status()}`,
        );
    }
};

test.describe('SQL Runner', { tag: '@mutating' }, () => {
    test('Should save a chart', async ({ page, request }) => {
        const chartName = `Customers table SQL chart ${crypto.randomUUID()}`;
        let createdSavedSqlUuid: string | null = null;

        try {
            const catalogResponsePromise = request.get(
                `/api/v1/projects/${projectUuid}/sqlRunner/tables`,
            );
            const homeResponse = await page.goto(
                `/projects/${projectUuid}/home`,
            );

            if (homeResponse === null || !homeResponse.ok()) {
                throw new Error('Project home navigation failed');
            }

            await page
                .getByRole('button', { name: 'New', exact: true })
                .click();
            await page
                .getByRole('menuitem', {
                    name: 'Query using SQL runner Access your database to run ad-hoc queries.',
                    exact: true,
                })
                .click();

            await expect(page).toHaveURL(
                (url) => url.pathname === `/projects/${projectUuid}/sql-runner`,
            );
            await expect(getMonacoEditor(page)).toBeVisible();

            const catalogResponse = await catalogResponsePromise;
            await expect(catalogResponse).toBeOK();
            const database = await parseCatalogDatabase(catalogResponse);
            const customersSql = `SELECT * FROM "${database}"."jaffle"."customers" `;
            const ordersSql = `SELECT * FROM "${database}"."jaffle"."orders"`;

            const runQueryButton = getRunQueryButton(page);
            await expect(runQueryButton).toBeDisabled();

            const tablesSidebar = page.locator('#sql-runner-tables');
            await tablesSidebar
                .getByRole('button', { name: 'jaffle', exact: true })
                .click();
            const customersTableButton = tablesSidebar.getByRole('button', {
                name: 'customers',
                exact: true,
            });
            await expect(customersTableButton).toBeVisible();
            await customersTableButton.click();

            await expectMonacoSql(page, customersSql);
            await expect(runQueryButton).toBeEnabled();
            await runSqlAndWaitForColumn(page, 'customer_id');

            await selectEditorView(page, 'Chart');
            const chartView = page.getByTestId(
                `chart-view-${ChartKind.VERTICAL_BAR}`,
            );
            await expect(chartView).toBeVisible();
            await expect(chartView.locator('svg')).toBeVisible();

            await page
                .getByRole('button', { name: 'Save chart', exact: true })
                .click();
            const saveChartDialog = page.getByRole('dialog', {
                name: 'Save Chart',
                exact: true,
            });
            await expect(saveChartDialog).toBeVisible();
            await saveChartDialog.getByLabel('Chart name').fill(chartName);
            await saveChartDialog
                .getByRole('button', { name: 'Next', exact: true })
                .click();
            await expect(
                saveChartDialog.getByPlaceholder('Search spaces'),
            ).toBeVisible();

            const createResponsePromise = page.waitForResponse((response) =>
                responseMatches(response, 'POST', savedSqlApiPath),
            );
            const initialSavedChartQueryPromise = waitForSavedSqlQuery(page);
            const destinationSaveButton = saveChartDialog.getByRole('button', {
                name: 'Save',
                exact: true,
            });
            await expect(destinationSaveButton).toBeEnabled();
            await destinationSaveButton.click();

            const createResponse = await createResponsePromise;
            expect(createResponse.ok()).toBe(true);
            const createdSavedSql = await parseCreatedSavedSql(createResponse);
            createdSavedSqlUuid = createdSavedSql.savedSqlUuid;

            const initialSavedChartQuery = await initialSavedChartQueryPromise;
            expect(initialSavedChartQuery.ok()).toBe(true);
            await expect(page).toHaveURL(
                (url) =>
                    url.pathname ===
                    `/projects/${projectUuid}/sql-runner/${createdSavedSql.slug}`,
            );
            await expect(
                page.getByRole('heading', {
                    name: chartName,
                    exact: true,
                }),
            ).toBeVisible();
            await expect(chartView).toBeVisible();
            await expect(chartView.locator('svg')).toBeVisible();

            await page
                .getByRole('button', { name: 'Edit chart', exact: true })
                .click();
            await expect(page).toHaveURL(
                (url) =>
                    url.pathname ===
                    `/projects/${projectUuid}/sql-runner/${createdSavedSql.slug}/edit`,
            );
            await expect(chartView).toBeVisible();
            await expect(page.getByTestId('chart-data-table')).toContainText(
                'age_sum',
            );

            await selectEditorView(page, 'SQL');
            await expect(getMonacoEditorInput(page)).toBeVisible();
            await replaceMonacoSql(page, ordersSql);
            await expect(getRunQueryButton(page)).toBeEnabled();
            await expect(
                page.getByRole('button', { name: 'Save', exact: true }),
            ).toBeEnabled();
            await runSqlAndWaitForColumn(page, 'order_id');

            await selectEditorView(page, 'Chart');
            await expect(
                page.getByText(
                    'Column "created" does not exist. Choose another',
                    {
                        exact: true,
                    },
                ),
            ).toBeVisible();
            await page
                .getByRole('button', { name: 'Save', exact: true })
                .click();

            const fixErrorsDialog = page.getByRole('dialog', {
                name: 'Fix errors before saving',
                exact: true,
            });
            await expect(fixErrorsDialog).toBeVisible();
            await fixErrorsDialog
                .getByRole('button', { name: 'Fix errors', exact: true })
                .click();

            const xAxisCombobox = page.getByPlaceholder('Select X axis');
            await expect(xAxisCombobox).toHaveAttribute(
                'aria-haspopup',
                'listbox',
            );
            await xAxisCombobox.click();
            await page
                .getByRole('option', { name: 'status', exact: true })
                .click();
            await expect(xAxisCombobox).toHaveValue('status');

            const yAxisCombobox = page.getByPlaceholder('Select Y axis');
            await expect(yAxisCombobox).toHaveAttribute(
                'aria-haspopup',
                'listbox',
            );
            await yAxisCombobox.click();
            await page
                .getByRole('option', { name: 'customer_id', exact: true })
                .click();
            await expect(yAxisCombobox).toHaveValue('customer_id');

            const updatePath = `${savedSqlApiPath}/${createdSavedSql.savedSqlUuid}`;
            const updateResponsePromise = page.waitForResponse((response) =>
                responseMatches(response, 'PATCH', updatePath),
            );
            await page
                .getByRole('button', { name: 'Save', exact: true })
                .click();

            const updateResponse = await updateResponsePromise;
            expect(updateResponse.ok()).toBe(true);
            await verifyUpdatedSavedSql(
                updateResponse,
                createdSavedSql.savedSqlUuid,
            );

            const backToViewButton = page.getByTestId(
                'back-to-view-page-button',
            );
            await expect(backToViewButton).toBeVisible();
            const finalSavedChartQueryPromise = waitForSavedSqlQuery(page);
            await backToViewButton.click();

            const finalSavedChartQuery = await finalSavedChartQueryPromise;
            expect(finalSavedChartQuery.ok()).toBe(true);
            await expect(page).toHaveURL(
                (url) =>
                    url.pathname ===
                    `/projects/${projectUuid}/sql-runner/${createdSavedSql.slug}`,
            );

            const finalChartView = page.getByTestId(
                `chart-view-${ChartKind.VERTICAL_BAR}`,
            );
            await expect(finalChartView).toBeVisible();
            await expect(
                finalChartView.getByText('Customer id avg', { exact: true }),
            ).toBeVisible();
            await expect(
                finalChartView.getByText('Status', { exact: true }),
            ).toBeVisible();
        } finally {
            if (createdSavedSqlUuid !== null) {
                await cleanupSavedSql(request, createdSavedSqlUuid);
            }
        }
    });
});
