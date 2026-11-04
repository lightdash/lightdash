import {
    ApiChartSummaryListResponse,
    CreateDashboard,
    DashboardFilterRule,
    DashboardTileTypes,
    FilterOperator,
    SEED_PROJECT,
} from '@lightdash/common';
import {
    deleteDashboardsByName,
    expect,
    json,
    loginAs,
    SEED_USERS,
    test,
    TrackedApi,
    withAdminApi,
    type Page,
    type Response,
} from '../../support/test';

const GROUP_DASHBOARD_NAME = 'e2e dashboard with filter requirement group';
const SINGLE_DASHBOARD_NAME = 'e2e dashboard with single required filter';
const GUIDED_DASHBOARD_NAME = 'e2e dashboard with guided filter setup';

const GUIDED_SETUP_NOTE = 'Pick your region to keep this dashboard fast.';

const CHART_NAME = 'How much revenue do we have per payment method?';

const CHART_QUERY_URL = /\/api\/v2\/projects\/[^/]+\/query\/dashboard-chart$/;

const paymentMethodFilter = (
    overrides: Partial<DashboardFilterRule>,
): DashboardFilterRule => ({
    id: 'e2e-payment-method-filter',
    label: 'Payment method',
    target: {
        fieldId: 'payments_payment_method',
        tableName: 'payments',
    },
    operator: FilterOperator.EQUALS,
    values: [],
    disabled: true,
    ...overrides,
});

const orderStatusFilter = (
    overrides: Partial<DashboardFilterRule>,
): DashboardFilterRule => ({
    id: 'e2e-order-status-filter',
    label: 'Order status',
    target: {
        fieldId: 'orders_status',
        tableName: 'orders',
    },
    operator: FilterOperator.EQUALS,
    values: [],
    disabled: true,
    ...overrides,
});

const createDashboardWithFilters = async (
    api: TrackedApi,
    name: string,
    dimensionFilters: DashboardFilterRule[],
    config?: CreateDashboard['config'],
): Promise<string> => {
    const chartsResponse = await api.get(
        `/api/v1/projects/${SEED_PROJECT.project_uuid}/charts`,
    );
    expect(chartsResponse.status()).toBe(200);
    const charts =
        await json<ApiChartSummaryListResponse['results']>(chartsResponse);
    const chart = charts.find(
        ({ name: chartName }) => chartName === CHART_NAME,
    );
    expect(chart, `chart "${CHART_NAME}" in seed project`).toBeDefined();
    if (!chart) throw new Error(`Missing chart "${CHART_NAME}"`);

    const body: CreateDashboard = {
        name,
        tiles: [
            {
                type: DashboardTileTypes.SAVED_CHART,
                x: 0,
                y: 0,
                w: 18,
                h: 9,
                tabUuid: null,
                properties: {
                    savedChartUuid: chart.uuid,
                },
            },
        ],
        filters: {
            dimensions: dimensionFilters,
            metrics: [],
            tableCalculations: [],
        },
        tabs: [],
        config,
    };

    const createResponse = await api.post(
        `/api/v1/projects/${SEED_PROJECT.project_uuid}/dashboards`,
        { data: body },
    );
    expect(createResponse.status()).toBe(201);
    return (await json<{ uuid: string }>(createResponse)).uuid;
};

const visitDashboard = async (page: Page, dashboardUuid: string) => {
    const dashboardLoad = page.waitForResponse(
        (response) =>
            response.request().method() === 'GET' &&
            /\/api\/v2\/projects\/[^/]+\/dashboards\/[^/]+$/.test(
                new URL(response.url()).pathname,
            ),
    );
    const availableFilters = page.waitForResponse(
        (response) =>
            response.request().method() === 'POST' &&
            new URL(response.url()).pathname.endsWith(
                '/api/v1/dashboards/availableFilters',
            ),
    );
    await page.goto(
        `/projects/${SEED_PROJECT.project_uuid}/dashboards/${dashboardUuid}/view`,
    );
    expect((await dashboardLoad).status()).toBe(200);
    expect((await availableFilters).status()).toBe(200);
};

// Counts chart queries the page sends, mirroring Cypress `@alias.all`.
const countChartQueries = (page: Page) => {
    const counter = { count: 0 };
    page.on('request', (request) => {
        if (
            request.method() === 'POST' &&
            CHART_QUERY_URL.test(new URL(request.url()).pathname)
        )
            counter.count += 1;
    });
    return counter;
};

// Field value search is either the sync endpoint or the async v2 query, depending on a feature flag.
const isPaymentValuesSearch = (response: Response) => {
    const request = response.request();
    if (request.method() !== 'POST') return false;
    const { pathname } = new URL(response.url());
    if (pathname.endsWith('/field/payments_payment_method/search')) return true;
    return (
        pathname.endsWith('/query/field-values') &&
        request.postData()?.includes('"payments_payment_method"') === true
    );
};

const waitForChartQuery = (page: Page) =>
    page.waitForResponse(
        (response) =>
            response.request().method() === 'POST' &&
            CHART_QUERY_URL.test(new URL(response.url()).pathname),
        { timeout: 30_000 },
    );

test.describe('Dashboard filter required groups', () => {
    test.beforeEach(async ({ api }) => {
        await loginAs(api.raw, SEED_USERS.admin);
    });

    test.afterAll(async ({ playwright }) => {
        await withAdminApi(playwright, (api) =>
            deleteDashboardsByName(api, [
                GROUP_DASHBOARD_NAME,
                SINGLE_DASHBOARD_NAME,
                GUIDED_DASHBOARD_NAME,
            ]),
        );
    });

    test('locks the dashboard until any filter in the required group has a value', async ({
        page,
        api,
    }) => {
        const chartQueries = countChartQueries(page);

        const dashboardUuid = await createDashboardWithFilters(
            api,
            GROUP_DASHBOARD_NAME,
            [
                paymentMethodFilter({ requiredGroupId: 'g1' }),
                orderStatusFilter({ requiredGroupId: 'g1' }),
            ],
        );
        await visitDashboard(page, dashboardUuid);

        // Locked: an any-of rule qualifies for the guided setup card
        await expect(page.getByTestId('guided-filter-setup')).toBeVisible();

        // Tiles show the locked skeleton placeholder: no chart rendered or loading
        await expect(
            page.getByTestId('unmet-requirements-placeholder').first(),
        ).toBeAttached();
        await expect(
            page.getByText('Loading chart', { exact: true }),
        ).toHaveCount(0);
        await expect(page.locator('.echarts-for-react')).toHaveCount(0);

        // No chart query ran while locked
        expect(chartQueries.count).toBe(0);

        // The escape hatch dismisses the card; the yellow required chips in the
        // toolbar remain the only affordance
        // Keyboard activation: the autofocused autocomplete dropdown can cover the link
        await page
            .getByText('Set filters in the toolbar instead', { exact: true })
            .press('Enter');
        await expect(page.getByTestId('guided-filter-setup')).toHaveCount(0);
        await expect(
            page.getByTestId('unmet-requirements-placeholder').first(),
        ).toBeAttached();

        // Set a value on ONE member of the group via its filter pill
        // force: the sortable pill wrapper is aria-disabled in view mode, which Playwright treats as disabled
        await page
            .locator('button', { hasText: 'Payment method' })
            .first()
            .click({ force: true });
        await page.getByPlaceholder('any value').fill('credit_card');
        await page.getByRole('option', { name: 'credit_card' }).click();
        const chartQuery = waitForChartQuery(page);
        await page
            .getByRole('button', { name: 'Apply' })
            .click({ force: true });

        // Unlocked: tile runs its query and renders
        await chartQuery;
        await expect(
            page.getByTestId('unmet-requirements-placeholder'),
        ).toHaveCount(0);
        await expect(
            page.getByText('Loading chart', { exact: true }),
        ).toHaveCount(0);
        await expect(page.locator('.echarts-for-react').first()).toBeAttached();
    });

    test('completes setup through the guided card and unlocks live', async ({
        page,
        api,
    }) => {
        // The first input autofocuses, so the search can fire before the click
        const paymentValuesSearch = page.waitForResponse(isPaymentValuesSearch);
        const dashboardUuid = await createDashboardWithFilters(
            api,
            GUIDED_DASHBOARD_NAME,
            [
                paymentMethodFilter({ required: true }),
                orderStatusFilter({ requiredGroupId: 'g1' }),
            ],
            {
                isDateZoomDisabled: false,
                requiredFiltersNote: GUIDED_SETUP_NOTE,
            },
        );
        await visitDashboard(page, dashboardUuid);

        // Two rules qualify for the card; the editor note renders as the
        // modal description and the progress as its footer, both outside the
        // rules list testid. The focused autocomplete can overlay the footer.
        await expect(
            page.getByText(GUIDED_SETUP_NOTE, { exact: true }),
        ).toBeVisible();
        await expect(
            page.getByText('0 of 2 set', { exact: true }),
        ).toBeAttached();
        const guidedSetup = page.getByTestId('guided-filter-setup');
        const firstInput = guidedSetup.getByPlaceholder('any value').first();
        await expect(firstInput).toBeEnabled();
        await firstInput.click();
        await paymentValuesSearch;
        await firstInput.fill('credit_card');
        // Autocomplete options render in a portal outside the card
        await page.getByRole('option', { name: 'credit_card' }).click();

        // The satisfied rule collapses to a summary line with a Change link
        await expect(
            page.getByText('1 of 2 set', { exact: true }),
        ).toBeVisible();
        await expect(
            guidedSetup.getByText('Change', { exact: true }),
        ).toBeVisible();
        // The collapsed summary shows the operator and the value
        await expect(
            guidedSetup.getByText('is credit_card', { exact: true }),
        ).toBeVisible();

        // Open the second rule's input (Order status); its field values
        // load on focus, so pick from the option list instead of typing
        await guidedSetup.getByPlaceholder('any value').first().click();
        // Autocomplete options render in a portal outside the card
        const chartQuery = waitForChartQuery(page);
        await page
            .getByRole('option', { name: 'Completed order' })
            .click({ timeout: 15_000 });

        // All rules met: the card unmounts and the dashboard loads live
        await expect(guidedSetup).toHaveCount(0);
        await chartQuery;
        await expect(
            page.getByTestId('unmet-requirements-placeholder'),
        ).toHaveCount(0);
        await expect(page.locator('.echarts-for-react').first()).toBeAttached();
    });

    test('locks a dashboard with a singleton required filter and shows the guided card', async ({
        page,
        api,
    }) => {
        const chartQueries = countChartQueries(page);

        const dashboardUuid = await createDashboardWithFilters(
            api,
            SINGLE_DASHBOARD_NAME,
            [paymentMethodFilter({ required: true })],
        );
        await visitDashboard(page, dashboardUuid);

        // A required filter is a one-member rule, so it also qualifies for
        // the guided card. Tiles stay blocked and no chart query runs. The
        // chip unlock flow is covered by the group test above.
        await expect(
            page.getByTestId('unmet-requirements-placeholder').first(),
        ).toBeAttached();
        await expect(page.getByTestId('guided-filter-setup')).toBeVisible();
        await expect(
            page.getByText('0 of 1 set', { exact: true }),
        ).toBeAttached();
        expect(chartQueries.count).toBe(0);
    });
});
