import { assertUnreachable, SEED_PROJECT } from '@lightdash/common';
import {
    expect,
    test,
    type APIRequestContext,
    type APIResponse,
    type Locator,
    type Page,
    type Response,
} from '@playwright/test';
import { randomUUID } from 'node:crypto';

const projectUuid = SEED_PROJECT.project_uuid;
const dashboardsPath = `/projects/${projectUuid}/dashboards`;
const createDashboardApiPath = `/api/v1/projects/${projectUuid}/dashboards`;
const createChartApiPath = `/api/v1/projects/${projectUuid}/saved`;
const seededDashboardName = 'Jaffle dashboard';
const seededSavedChartName = 'How much revenue do we have per payment method?';
const totalRevenueChartName = "What's our total revenue to date?";
const averageSpendChartName = "What's the average spend per customer?";
const customerTableChartName =
    'Which customers have not recently ordered an item?';
const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type CreatedChart = {
    uuid: string;
    dashboardUuid: string;
};

type CaptureResult<T> =
    | { status: 'success'; value: T }
    | { status: 'error'; error: Error };

type CaptureRecord<T> = {
    response: Response;
    result: Promise<CaptureResult<T>>;
};

type RequestResult =
    | { status: 'response'; statusCode: number }
    | { status: 'error'; error: Error };

const toError = (error: unknown, context: string) =>
    error instanceof Error
        ? new Error(`${context}: ${error.message}`)
        : new Error(`${context}: ${String(error)}`);

const parseJson = (text: string, context: string): unknown => {
    try {
        const value: unknown = JSON.parse(text);
        return value;
    } catch (error: unknown) {
        throw toError(error, `${context} returned invalid JSON`);
    }
};

const getProperty = (
    value: unknown,
    property: string,
    context: string,
): unknown => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new Error(`${context} must be an object`);
    }

    return Reflect.get(value, property);
};

const getUuidProperty = (value: unknown, property: string, context: string) => {
    const uuid = getProperty(value, property, context);
    if (typeof uuid !== 'string' || !uuidPattern.test(uuid)) {
        throw new Error(`${context}.${property} must be a UUID`);
    }

    return uuid;
};

const parseApiResults = async (response: Response, context: string) => {
    if (!response.ok()) {
        throw new Error(`${context} failed with status ${response.status()}`);
    }

    const payload = parseJson(await response.text(), context);
    const status = getProperty(payload, 'status', context);
    if (status !== 'ok') {
        throw new Error(`${context}.status must be "ok"`);
    }

    return getProperty(payload, 'results', context);
};

const parseCreatedDashboardResponse = async (response: Response) =>
    getUuidProperty(
        await parseApiResults(response, 'Create dashboard response'),
        'uuid',
        'Create dashboard response.results',
    );

const parseCreatedChartResponse = async (
    response: Response,
): Promise<CreatedChart> => {
    const results = await parseApiResults(response, 'Create chart response');
    return {
        uuid: getUuidProperty(results, 'uuid', 'Create chart response.results'),
        dashboardUuid: getUuidProperty(
            results,
            'dashboardUuid',
            'Create chart response.results',
        ),
    };
};

const capture = async <T>(
    operation: () => Promise<T>,
): Promise<CaptureResult<T>> => {
    try {
        return { status: 'success', value: await operation() };
    } catch (error: unknown) {
        return {
            status: 'error',
            error: toError(error, 'Response capture failed'),
        };
    }
};

const requireCapturedValue = <T>(result: CaptureResult<T>): T => {
    switch (result.status) {
        case 'success':
            return result.value;
        case 'error':
            throw result.error;
        default:
            return assertUnreachable(result, 'Unknown capture result');
    }
};

const responseMatches = (
    response: Response,
    method: 'POST' | 'PATCH',
    pathname: string,
) =>
    response.request().method() === method &&
    new URL(response.url()).pathname === pathname;

const findCapture = <T>(
    records: CaptureRecord<T>[],
    response: Response,
): Promise<CaptureResult<T>> | null =>
    records.find((record) => record.response === response)?.result ?? null;

const getDashboardGrid = (page: Page) => page.locator('.react-grid-layout');

const getDialog = (page: Page, title: string) =>
    page.getByRole('dialog', { name: title, exact: true });

const getDashboardTile = (page: Page, title: string) =>
    getDashboardGrid(page)
        .locator('.react-grid-item')
        .filter({ has: page.getByText(title, { exact: true }) });

const getDashboardHeader = (page: Page, dashboardName: string) =>
    page
        .getByRole('heading', {
            name: dashboardName,
            exact: true,
            level: 6,
        })
        .locator('..')
        .locator('..');

const openSeedDashboard = async (page: Page) => {
    await page.goto(dashboardsPath);
    const dashboardLink = page.getByRole('link').filter({
        has: page.getByText(seededDashboardName, { exact: true }),
    });
    await expect(dashboardLink).toBeVisible();
    await dashboardLink.click();
    await expect(page).toHaveURL(
        (url) =>
            url.pathname.startsWith(`${dashboardsPath}/`) &&
            url.pathname !== dashboardsPath,
    );
    return getDashboardGrid(page);
};

const expectNoChartErrors = async (grid: Locator) => {
    await expect(grid.getByText('Loading chart', { exact: true })).toHaveCount(
        0,
        { timeout: 30_000 },
    );
    await expect(
        grid.getByText('No chart available', { exact: true }),
    ).toHaveCount(0);
    await expect(
        grid.getByText('No data available', { exact: true }),
    ).toHaveCount(0);
};

const openAddTileMenu = async (
    page: Page,
    dashboardName: string,
    tileType: 'Saved chart' | 'New chart' | 'Markdown',
) => {
    const header = getDashboardHeader(page, dashboardName);
    const addTileButton = header.getByRole('button', {
        name: 'Add tile',
        exact: true,
    });
    await expect(addTileButton).toBeVisible();
    await addTileButton.click();
    const menuItem = page.getByRole('menuitem', {
        name: tileType,
        exact: true,
    });
    await expect(menuItem).toBeVisible();
    await menuItem.click();
};

const expectDashboardEditor = async (
    page: Page,
    dashboardName: string,
    dashboardUuid: string,
) => {
    await expect(page).toHaveURL((url) =>
        url.pathname.startsWith(`${dashboardsPath}/${dashboardUuid}/edit`),
    );
    await expect(
        getDashboardHeader(page, dashboardName).getByRole('button', {
            name: 'Add tile',
            exact: true,
        }),
    ).toBeVisible();
};

const selectExplore = async (page: Page, exploreName: string) => {
    const search = page.getByPlaceholder('Search tables');
    await expect(search).toBeVisible();
    await search.fill(exploreName);
    const explore = page
        .getByRole('listitem')
        .filter({ has: page.getByText(exploreName, { exact: true }) });
    await expect(explore).toBeVisible();
    await explore.click();
    await expect(
        page.getByPlaceholder('Search metrics + dimensions'),
    ).toBeVisible();
};

type ExploreField = {
    label: string;
    id: string;
};

const selectExploreField = async (page: Page, field: ExploreField) => {
    const fieldOption = page.getByTestId(`tree-single-node-${field.label}`);
    await expect(fieldOption).toBeVisible();
    await fieldOption.click();
    await expect(page.getByTestId(`selected-field-${field.id}`)).toBeVisible();
};

const createDashboardChart = async ({
    page,
    dashboardName,
    dashboardUuid,
    exploreName,
    fields,
    chartName,
    chartCaptures,
    ownedChartUuids,
}: {
    page: Page;
    dashboardName: string;
    dashboardUuid: string;
    exploreName: string;
    fields: [ExploreField, ExploreField];
    chartName: string;
    chartCaptures: CaptureRecord<CreatedChart>[];
    ownedChartUuids: Set<string>;
}) => {
    await openAddTileMenu(page, dashboardName, 'New chart');
    await expect(
        page.getByText(
            `You are creating this chart from within "${dashboardName}"`,
            { exact: true },
        ),
    ).toBeVisible();
    await selectExplore(page, exploreName);
    await selectExploreField(page, fields[0]);
    await selectExploreField(page, fields[1]);

    await page.getByRole('button', { name: 'Save chart', exact: true }).click();
    const dialog = getDialog(page, `Save chart to "${dashboardName}"`);
    await expect(dialog).toBeVisible();
    await dialog.getByLabel('Chart name').fill(chartName);

    const responsePromise = page.waitForResponse((response) =>
        responseMatches(response, 'POST', createChartApiPath),
    );
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    const response = await responsePromise;
    const captured = await (findCapture(chartCaptures, response) ??
        capture(() => parseCreatedChartResponse(response)));
    const createdChart = requireCapturedValue(captured);
    ownedChartUuids.add(createdChart.uuid);
    if (createdChart.dashboardUuid !== dashboardUuid) {
        throw new Error(
            `Created chart ${createdChart.uuid} belongs to unexpected dashboard ${createdChart.dashboardUuid}`,
        );
    }

    await expect(
        page.getByText(`Success! ${chartName} was added to ${dashboardName}`, {
            exact: true,
        }),
    ).toBeVisible();
    await expectDashboardEditor(page, dashboardName, dashboardUuid);
    await expect(getDashboardTile(page, chartName)).toHaveCount(1);
};

const getFilterConfiguration = (page: Page) =>
    page
        .getByRole('tab', { name: 'Filter Settings', exact: true })
        .locator('..')
        .locator('..')
        .locator('..');

const addPaymentMethodFilter = async (page: Page) => {
    await page.getByRole('button', { name: 'Add filter', exact: true }).click();
    const configuration = getFilterConfiguration(page);
    await expect(configuration).toBeVisible();
    await configuration.getByTestId('FilterConfiguration/FieldSelect').click();
    await configuration
        .getByTestId('FilterConfiguration/FieldSelectSearch')
        .fill('payment');
    const fieldOption = configuration.getByRole('option', {
        name: 'Payment method',
        exact: true,
    });
    await expect(fieldOption).toBeVisible();
    await fieldOption.click();

    const defaultValueCheckbox = configuration.getByLabel(
        'Provide default value',
    );
    await configuration
        .getByText('Provide default value', { exact: true })
        .click();
    await expect(defaultValueCheckbox).toBeChecked();
    await configuration
        .getByPlaceholder('Start typing to filter results')
        .fill('credit_card');
    const valueOption = configuration.getByRole('option', {
        name: 'credit_card',
        exact: true,
    });
    await expect(valueOption).toBeVisible();
    await valueOption.click();
    await configuration
        .getByRole('button', { name: 'Apply', exact: true })
        .click();
};

const openPaymentMethodFilter = async (page: Page) => {
    const matchingFilters = page.getByRole('button', {
        name: 'Payment method is credit_card',
        exact: true,
    });
    const filter = matchingFilters.filter({ hasNot: matchingFilters });
    await expect(filter).toHaveCount(1);
    await filter.click();
    const configuration = getFilterConfiguration(page);
    await expect(configuration).toBeVisible();
    return configuration;
};

const saveDashboard = async (
    page: Page,
    dashboardName: string,
    dashboardUuid: string,
) => {
    const updatePath = `/api/v2/projects/${projectUuid}/dashboards/${dashboardUuid}`;
    const responsePromise = page.waitForResponse((response) =>
        responseMatches(response, 'PATCH', updatePath),
    );
    await getDashboardHeader(page, dashboardName)
        .getByRole('button', { name: 'Save changes', exact: true })
        .click();
    const response = await responsePromise;
    if (!response.ok()) {
        throw new Error(
            `Update dashboard response failed with status ${response.status()}`,
        );
    }
    await expect(
        page
            .getByRole('alert')
            .getByText('Success! Dashboard was updated.', { exact: true }),
    ).toBeVisible();
    await expect(
        page.getByRole('button', { name: 'Edit dashboard', exact: true }),
    ).toBeVisible();
};

const enterDashboardEditMode = async (page: Page) => {
    await page
        .getByRole('button', { name: 'Edit dashboard', exact: true })
        .click();
    await expect(
        page.getByRole('button', { name: 'Save changes', exact: true }),
    ).toBeVisible();
};

const expectFilterValue = async (
    page: Page,
    chartName: string,
    expectedValue: 'bank_transfer' | 'credit_card',
) => {
    const tile = getDashboardTile(page, chartName);
    await expect(tile).toHaveCount(1);
    await tile.scrollIntoViewIfNeeded();
    await expect(tile).toContainText(expectedValue, { timeout: 30_000 });
};

const expectFilterValueAbsent = async (
    page: Page,
    chartName: string,
    absentValue: 'bank_transfer',
) => {
    const tile = getDashboardTile(page, chartName);
    await expect(tile).toHaveCount(1);
    await tile.scrollIntoViewIfNeeded();
    await expect(tile).not.toContainText(absentValue);
};

const performRequest = async (
    operation: () => Promise<APIResponse>,
    context: string,
): Promise<RequestResult> => {
    try {
        const response = await operation();
        return { status: 'response', statusCode: response.status() };
    } catch (error: unknown) {
        return { status: 'error', error: toError(error, context) };
    }
};

const isResponseStatus = (result: RequestResult, statusCode: number) => {
    switch (result.status) {
        case 'response':
            return result.statusCode === statusCode;
        case 'error':
            return false;
        default:
            return assertUnreachable(result, 'Unknown request result');
    }
};

const requestErrors = (
    result: RequestResult,
    expectedStatusCodes: number[],
    context: string,
): Error[] => {
    switch (result.status) {
        case 'response':
            return expectedStatusCodes.includes(result.statusCode)
                ? []
                : [
                      new Error(
                          `${context}: expected ${expectedStatusCodes.join(' or ')}, received ${result.statusCode}`,
                      ),
                  ];
        case 'error':
            return [result.error];
        default:
            return assertUnreachable(result, 'Unknown request result');
    }
};

const cleanupCreatedResources = async (
    request: APIRequestContext,
    dashboardUuid: string | null,
    ownedChartUuids: string[],
): Promise<Error[]> => {
    const errors: Error[] = [];
    const dashboardUrl =
        dashboardUuid === null
            ? null
            : `/api/v2/projects/${projectUuid}/dashboards/${dashboardUuid}`;

    if (dashboardUrl !== null) {
        const result = await performRequest(
            () => request.delete(dashboardUrl),
            `Soft-delete dashboard ${dashboardUuid}`,
        );
        errors.push(
            ...requestErrors(
                result,
                [200],
                `Soft-delete dashboard ${dashboardUuid}`,
            ),
        );
    } else {
        const chartDeleteResults = await Promise.all(
            ownedChartUuids.map(async (chartUuid) => ({
                chartUuid,
                result: await performRequest(
                    () =>
                        request.delete(
                            `/api/v2/projects/${projectUuid}/saved/${chartUuid}`,
                        ),
                    `Soft-delete chart ${chartUuid}`,
                ),
            })),
        );
        errors.push(
            ...chartDeleteResults.flatMap(({ chartUuid, result }) =>
                requestErrors(result, [200], `Soft-delete chart ${chartUuid}`),
            ),
        );
    }

    if (dashboardUrl !== null) {
        const result = await performRequest(
            () => request.get(dashboardUrl),
            `Verify dashboard ${dashboardUuid} is inactive`,
        );
        errors.push(
            ...requestErrors(
                result,
                [404],
                `Verify dashboard ${dashboardUuid} is inactive`,
            ),
        );
    }

    const chartVerifications = await Promise.all(
        ownedChartUuids.map(async (chartUuid) => ({
            chartUuid,
            result: await performRequest(
                () =>
                    request.get(
                        `/api/v2/projects/${projectUuid}/saved/${chartUuid}`,
                    ),
                `Verify chart ${chartUuid} is inactive`,
            ),
        })),
    );
    errors.push(
        ...chartVerifications.flatMap(({ chartUuid, result }) =>
            requestErrors(
                result,
                [404],
                `Verify chart ${chartUuid} is inactive`,
            ),
        ),
    );

    const chartFallbackResults = await Promise.all(
        chartVerifications
            .filter(({ result }) => !isResponseStatus(result, 404))
            .map(async ({ chartUuid }) => {
                const chartUrl = `/api/v2/projects/${projectUuid}/saved/${chartUuid}`;
                const deleteResult = await performRequest(
                    () => request.delete(chartUrl),
                    `Fallback soft-delete chart ${chartUuid}`,
                );
                const verificationResult = await performRequest(
                    () => request.get(chartUrl),
                    `Verify fallback cleanup for chart ${chartUuid}`,
                );
                return { chartUuid, deleteResult, verificationResult };
            }),
    );
    errors.push(
        ...chartFallbackResults.flatMap(
            ({ chartUuid, deleteResult, verificationResult }) => [
                ...requestErrors(
                    deleteResult,
                    [200, 404],
                    `Fallback soft-delete chart ${chartUuid}`,
                ),
                ...requestErrors(
                    verificationResult,
                    [404],
                    `Verify fallback cleanup for chart ${chartUuid}`,
                ),
            ],
        ),
    );

    return errors;
};

const getDashboardUuidFromRoute = (page: Page) => {
    const pathParts = new URL(page.url()).pathname.split('/');
    const dashboardsIndex = pathParts.indexOf('dashboards');
    const candidate = pathParts[dashboardsIndex + 1];
    return candidate !== undefined && uuidPattern.test(candidate)
        ? candidate
        : null;
};

const getErrorsFromCaptures = <T>(results: CaptureResult<T>[]) =>
    results.flatMap((result) => {
        switch (result.status) {
            case 'success':
                return [];
            case 'error':
                return [result.error];
            default:
                return assertUnreachable(result, 'Unknown capture result');
        }
    });

const formatError = (error: unknown) =>
    error instanceof Error ? error.message : String(error);

test('admin can view the seeded dashboard', async ({ page }) => {
    const grid = await openSeedDashboard(page);
    await expect(
        grid.getByRole('link', {
            name: totalRevenueChartName,
            exact: true,
        }),
    ).toBeVisible();
    await expect(
        grid.getByRole('link', {
            name: averageSpendChartName,
            exact: true,
        }),
    ).toBeVisible();

    const tableTile = getDashboardTile(page, customerTableChartName);
    await expect(tableTile).toHaveCount(1);
    await tableTile.scrollIntoViewIfNeeded();
    await expect(
        grid.getByText('Payments total revenue', { exact: true }),
    ).toBeVisible();
    await expect(tableTile.locator('thead th')).toHaveCount(6);
    // The five seeded charts use three ECharts, one big-number, and one table renderer.
    await expect(grid.locator('.echarts-for-react')).toHaveCount(3);
    await expectNoChartErrors(grid);
});

test('admin can view underlying dimensions and metrics', async ({ page }) => {
    await openSeedDashboard(page);
    const tile = getDashboardTile(page, totalRevenueChartName);
    await expect(tile).toHaveCount(1);
    const bigNumber = tile.getByTestId('big-number-value');
    await expect(bigNumber).toHaveCount(1);
    await bigNumber.scrollIntoViewIfNeeded();
    await bigNumber.click();
    await page
        .getByRole('menuitem', {
            name: 'View underlying data',
            exact: true,
        })
        .click();

    const dialog = getDialog(page, 'View underlying data');
    await expect(dialog).toBeVisible();
    await expect(
        dialog.getByText('Payments Unique payment count', { exact: true }),
    ).toBeVisible();
    await expect(
        dialog.getByText('Orders Average order size', { exact: true }),
    ).toBeVisible();
    await expect(
        dialog.getByText('Orders Status', { exact: true }),
    ).toBeVisible();
    await expect(
        dialog.getByText('Orders Order date', { exact: true }),
    ).toBeVisible();
    await expect(
        dialog.getByText('Payments Amount', { exact: true }),
    ).toBeVisible();
});

test(
    'admin can create a dashboard with charts, filters, and tile targets',
    { tag: '@mutating' },
    async ({ page }) => {
        test.setTimeout(180_000);

        const suffix = `${Date.now()}-${randomUUID().slice(0, 8)}`;
        const dashboardName = `Dashboard port ${suffix}`;
        const uniquePaymentChartName = `Unique payments ${suffix}`;
        const totalRevenueOwnedChartName = `Total revenue ${suffix}`;
        const stagingChartName = `Stg payment amounts ${suffix}`;
        const markdownTitle = `Notes ${suffix}`;
        const markdownContent = `Dashboard content ${suffix}`;
        const dashboardCaptures: CaptureRecord<string>[] = [];
        const chartCaptures: CaptureRecord<CreatedChart>[] = [];
        const ownedChartUuids = new Set<string>();
        let dashboardUuid: string | null = null;
        let workflowFailed = false;
        let workflowError: unknown;
        const cleanupErrors: Error[] = [];

        const captureCreatedResponse = (response: Response) => {
            if (responseMatches(response, 'POST', createDashboardApiPath)) {
                dashboardCaptures.push({
                    response,
                    result: capture(() =>
                        parseCreatedDashboardResponse(response),
                    ),
                });
            }
            if (responseMatches(response, 'POST', createChartApiPath)) {
                chartCaptures.push({
                    response,
                    result: capture(() => parseCreatedChartResponse(response)),
                });
            }
        };
        page.on('response', captureCreatedResponse);

        try {
            await page.goto(dashboardsPath);
            await page
                .getByRole('button', {
                    name: 'Create dashboard',
                    exact: true,
                })
                .click();
            const createDialog = getDialog(page, 'Create Dashboard');
            await expect(createDialog).toBeVisible();
            await createDialog
                .getByLabel('Name your dashboard')
                .fill(dashboardName);
            await createDialog
                .getByLabel('Dashboard description')
                .fill(`Description ${suffix}`);
            await createDialog
                .getByRole('button', { name: 'Next', exact: true })
                .click();

            const dashboardResponsePromise = page.waitForResponse((response) =>
                responseMatches(response, 'POST', createDashboardApiPath),
            );
            await createDialog
                .getByRole('button', { name: 'Create', exact: true })
                .click();
            const dashboardResponse = await dashboardResponsePromise;
            const capturedDashboard = await (findCapture(
                dashboardCaptures,
                dashboardResponse,
            ) ??
                capture(() =>
                    parseCreatedDashboardResponse(dashboardResponse),
                ));
            dashboardUuid = requireCapturedValue(capturedDashboard);
            await expectDashboardEditor(page, dashboardName, dashboardUuid);

            await openAddTileMenu(page, dashboardName, 'Saved chart');
            const addChartsDialog = getDialog(page, 'Add saved charts');
            const chartSearch = addChartsDialog.getByRole('searchbox', {
                name: 'Select the charts you want to add to this dashboard',
                exact: true,
            });
            await chartSearch.fill('How much revenue');
            const savedChartOption = page.getByRole('option', {
                name: seededSavedChartName,
                exact: true,
            });
            await expect(savedChartOption).toBeVisible();
            await savedChartOption.click();
            await page.keyboard.press('Escape');
            await addChartsDialog
                .getByRole('button', { name: 'Add', exact: true })
                .click();
            await expect(
                getDashboardTile(page, seededSavedChartName),
            ).toHaveCount(1);

            await createDashboardChart({
                page,
                dashboardName,
                dashboardUuid,
                exploreName: 'Payments',
                fields: [
                    { label: 'Payment method', id: 'payments_payment_method' },
                    {
                        label: 'Unique payment count',
                        id: 'payments_unique_payment_count',
                    },
                ],
                chartName: uniquePaymentChartName,
                chartCaptures,
                ownedChartUuids,
            });

            await addPaymentMethodFilter(page);
            await expectFilterValue(
                page,
                uniquePaymentChartName,
                'credit_card',
            );
            await expectFilterValueAbsent(
                page,
                uniquePaymentChartName,
                'bank_transfer',
            );
            await expectFilterValueAbsent(
                page,
                seededSavedChartName,
                'bank_transfer',
            );
            await saveDashboard(page, dashboardName, dashboardUuid);
            await enterDashboardEditMode(page);

            await createDashboardChart({
                page,
                dashboardName,
                dashboardUuid,
                exploreName: 'Payments',
                fields: [
                    { label: 'Payment method', id: 'payments_payment_method' },
                    { label: 'Total revenue', id: 'payments_total_revenue' },
                ],
                chartName: totalRevenueOwnedChartName,
                chartCaptures,
                ownedChartUuids,
            });
            await expectFilterValue(
                page,
                totalRevenueOwnedChartName,
                'credit_card',
            );
            await expectFilterValueAbsent(
                page,
                totalRevenueOwnedChartName,
                'bank_transfer',
            );

            let filterConfiguration = await openPaymentMethodFilter(page);
            await filterConfiguration
                .getByRole('tab', { name: 'Chart tiles', exact: true })
                .click();
            let chartTiles = filterConfiguration.getByTestId(
                'DashboardFilterConfiguration/ChartTiles',
            );
            const savedChartCheckbox = chartTiles.getByRole('checkbox', {
                name: seededSavedChartName,
                exact: true,
            });
            await expect(savedChartCheckbox).toBeChecked();
            await expect(
                chartTiles.getByRole('checkbox', {
                    name: uniquePaymentChartName,
                    exact: true,
                }),
            ).toBeChecked();
            await expect(
                chartTiles.getByRole('checkbox', {
                    name: totalRevenueOwnedChartName,
                    exact: true,
                }),
            ).toBeChecked();
            await chartTiles
                .getByText(seededSavedChartName, { exact: true })
                .click();
            await expect(savedChartCheckbox).not.toBeChecked();
            await filterConfiguration
                .getByRole('button', { name: 'Apply', exact: true })
                .click();
            await expectFilterValue(
                page,
                seededSavedChartName,
                'bank_transfer',
            );
            await saveDashboard(page, dashboardName, dashboardUuid);
            await enterDashboardEditMode(page);

            await createDashboardChart({
                page,
                dashboardName,
                dashboardUuid,
                exploreName: 'Stg payments',
                fields: [
                    {
                        label: 'Payment method',
                        id: 'stg_payments_payment_method',
                    },
                    { label: 'Amount', id: 'stg_payments_amount' },
                ],
                chartName: stagingChartName,
                chartCaptures,
                ownedChartUuids,
            });

            filterConfiguration = await openPaymentMethodFilter(page);
            await filterConfiguration
                .getByRole('tab', { name: 'Chart tiles', exact: true })
                .click();
            chartTiles = filterConfiguration.getByTestId(
                'DashboardFilterConfiguration/ChartTiles',
            );
            await expect(
                chartTiles.getByRole('checkbox', {
                    name: seededSavedChartName,
                    exact: true,
                }),
            ).not.toBeChecked();
            await expect(
                chartTiles.getByRole('checkbox', {
                    name: uniquePaymentChartName,
                    exact: true,
                }),
            ).toBeChecked();
            await expect(
                chartTiles.getByRole('checkbox', {
                    name: totalRevenueOwnedChartName,
                    exact: true,
                }),
            ).toBeChecked();
            const stagingChartCheckbox = chartTiles.getByRole('checkbox', {
                name: stagingChartName,
                exact: true,
            });
            await expect(stagingChartCheckbox).not.toBeChecked();
            await chartTiles
                .getByText(stagingChartName, { exact: true })
                .click();
            await expect(stagingChartCheckbox).toBeChecked();
            await filterConfiguration
                .getByRole('button', { name: 'Apply', exact: true })
                .click();
            await expectFilterValue(page, stagingChartName, 'credit_card');
            await expectFilterValueAbsent(
                page,
                stagingChartName,
                'bank_transfer',
            );

            await openAddTileMenu(page, dashboardName, 'Markdown');
            const markdownDialog = getDialog(page, 'Add markdown tile');
            await markdownDialog
                .getByRole('textbox', { name: 'Title', exact: true })
                .fill(markdownTitle);
            await markdownDialog
                .getByRole('textbox', {
                    name: 'Markdown content',
                    exact: true,
                })
                .fill(markdownContent);
            await markdownDialog
                .getByRole('button', { name: 'Add', exact: true })
                .click();
            await saveDashboard(page, dashboardName, dashboardUuid);

            const grid = getDashboardGrid(page);
            await expect(
                grid.getByText(markdownTitle, { exact: true }),
            ).toBeVisible();
            await expect(
                grid.getByText(markdownContent, { exact: true }),
            ).toBeVisible();
            await expectFilterValue(
                page,
                seededSavedChartName,
                'bank_transfer',
            );
            await expectFilterValue(
                page,
                uniquePaymentChartName,
                'credit_card',
            );
            await expectFilterValue(
                page,
                totalRevenueOwnedChartName,
                'credit_card',
            );
            await expectFilterValue(page, stagingChartName, 'credit_card');
            await expectNoChartErrors(grid);
        } catch (error: unknown) {
            workflowFailed = true;
            workflowError = error;
        } finally {
            page.off('response', captureCreatedResponse);

            const dashboardCaptureResults = await Promise.all(
                dashboardCaptures.map(({ result }) => result),
            );
            const chartCaptureResults = await Promise.all(
                chartCaptures.map(({ result }) => result),
            );
            cleanupErrors.push(
                ...getErrorsFromCaptures(dashboardCaptureResults),
                ...getErrorsFromCaptures(chartCaptureResults),
            );

            dashboardCaptureResults.forEach((result) => {
                if (result.status === 'success') {
                    if (
                        dashboardUuid !== null &&
                        dashboardUuid !== result.value
                    ) {
                        cleanupErrors.push(
                            new Error(
                                `Captured conflicting dashboard UUID ${result.value}`,
                            ),
                        );
                    }
                    dashboardUuid = result.value;
                }
            });
            chartCaptureResults.forEach((result) => {
                if (result.status === 'success') {
                    ownedChartUuids.add(result.value.uuid);
                    if (
                        dashboardUuid !== null &&
                        dashboardUuid !== result.value.dashboardUuid
                    ) {
                        cleanupErrors.push(
                            new Error(
                                `Chart ${result.value.uuid} belongs to unexpected dashboard ${result.value.dashboardUuid}`,
                            ),
                        );
                    }
                    dashboardUuid = result.value.dashboardUuid;
                }
            });

            const routeDashboardUuid = getDashboardUuidFromRoute(page);
            if (routeDashboardUuid !== null) {
                if (
                    dashboardUuid !== null &&
                    dashboardUuid !== routeDashboardUuid
                ) {
                    cleanupErrors.push(
                        new Error(
                            `Route contains conflicting dashboard UUID ${routeDashboardUuid}`,
                        ),
                    );
                }
                dashboardUuid = routeDashboardUuid;
            }

            cleanupErrors.push(
                ...(await cleanupCreatedResources(page.request, dashboardUuid, [
                    ...ownedChartUuids,
                ])),
            );
        }

        if (workflowFailed && cleanupErrors.length > 0) {
            throw new Error(
                [
                    `Workflow failed: ${formatError(workflowError)}`,
                    ...cleanupErrors.map(
                        (error) => `Cleanup failed: ${error.message}`,
                    ),
                ].join('\n'),
            );
        }
        if (workflowFailed) {
            throw workflowError;
        }
        if (cleanupErrors.length > 0) {
            throw new Error(
                cleanupErrors
                    .map((error) => `Cleanup failed: ${error.message}`)
                    .join('\n'),
            );
        }
    },
);
