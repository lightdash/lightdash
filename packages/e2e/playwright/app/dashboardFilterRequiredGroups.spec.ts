import {
    DashboardTileTypes,
    FilterOperator,
    SEED_PROJECT,
    type CreateDashboard,
    type DashboardFilterRule,
} from '@lightdash/common';
import {
    expect,
    test,
    type APIRequestContext,
    type Page,
    type Request,
} from '@playwright/test';
import { randomUUID } from 'node:crypto';

const GROUP_DASHBOARD_NAME =
    'Playwright e2e dashboard with filter requirement group';
const SINGLE_DASHBOARD_NAME =
    'Playwright e2e dashboard with single required filter';
const GUIDED_DASHBOARD_NAME =
    'Playwright e2e dashboard with guided filter setup';

const GUIDED_SETUP_NOTE = 'Pick your region to keep this dashboard fast.';
const CHART_NAME = 'How much revenue do we have per payment method?';

const chartsApiPath = `/api/v1/projects/${SEED_PROJECT.project_uuid}/charts`;
const createDashboardApiPath = `/api/v1/projects/${SEED_PROJECT.project_uuid}/dashboards`;
const dashboardChartQueryPath = `/api/v2/projects/${SEED_PROJECT.project_uuid}/query/dashboard-chart`;
const paymentMethodSearchPath = `/api/v1/projects/${SEED_PROJECT.project_uuid}/field/payments_payment_method/search`;
const dashboardApiPath = (dashboardUuid: string) =>
    `/api/v2/projects/${SEED_PROJECT.project_uuid}/dashboards/${dashboardUuid}`;
const dashboardViewPath = (dashboardUuid: string) =>
    `/projects/${SEED_PROJECT.project_uuid}/dashboards/${dashboardUuid}/view`;
const getGuidedSetupDialog = (page: Page) =>
    page.getByRole('dialog', {
        name: 'Set filters to load this dashboard',
        exact: true,
    });
const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const createdDashboardUuids = new Set<string>();

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

const parseObject = (value: unknown): Record<string, unknown> => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new Error('Expected an object response');
    }

    return Object.fromEntries(Object.entries(value));
};

const parseChartSummaries = (value: unknown) => {
    const response = parseObject(value);
    if (response.status !== 'ok' || !Array.isArray(response.results)) {
        throw new Error('Expected a successful chart list response');
    }

    return response.results.map((result, index) => {
        const chart = parseObject(result);
        const { name, uuid } = chart;
        if (
            typeof name !== 'string' ||
            typeof uuid !== 'string' ||
            !uuidPattern.test(uuid)
        ) {
            throw new Error(`Expected chart ${index} to have a name and UUID`);
        }

        return { name, uuid };
    });
};

const parseCreatedDashboardUuid = (value: unknown) => {
    const response = parseObject(value);
    if (response.status !== 'ok') {
        throw new Error('Expected a successful dashboard creation response');
    }

    const dashboard = parseObject(response.results);
    const { uuid } = dashboard;
    if (typeof uuid !== 'string' || !uuidPattern.test(uuid)) {
        throw new Error('Expected the created dashboard to have a UUID');
    }

    return uuid;
};

const createDashboardWithFilters = async (
    request: APIRequestContext,
    name: string,
    dimensionFilters: DashboardFilterRule[],
    config?: CreateDashboard['config'],
) => {
    const chartsResponse = await request.get(chartsApiPath);
    expect(chartsResponse.status(), 'seed chart list response status').toBe(
        200,
    );
    const chartsBody: unknown = await chartsResponse.json();
    const matchingCharts = parseChartSummaries(chartsBody).filter(
        ({ name: chartName }) => chartName === CHART_NAME,
    );

    if (matchingCharts.length !== 1) {
        throw new Error(
            `Expected exactly one seed chart named "${CHART_NAME}", found ${matchingCharts.length}`,
        );
    }

    const [chart] = matchingCharts;
    if (chart === undefined) {
        throw new Error(`Seed chart "${CHART_NAME}" was not found`);
    }

    const body = {
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
        ...(config === undefined ? {} : { config }),
    } satisfies CreateDashboard;

    const createResponse = await request.post(createDashboardApiPath, {
        data: body,
    });
    expect(createResponse.status(), 'dashboard creation response status').toBe(
        201,
    );
    const createBody: unknown = await createResponse.json();
    const dashboardUuid = parseCreatedDashboardUuid(createBody);
    createdDashboardUuids.add(dashboardUuid);
    return dashboardUuid;
};

const isPostRequestTo = (request: Request, path: string) =>
    request.method() === 'POST' && new URL(request.url()).pathname === path;

const isDashboardChartRequest = (request: Request) =>
    isPostRequestTo(request, dashboardChartQueryPath);

const collectDashboardChartRequests = (page: Page) => {
    const requests: Request[] = [];
    page.on('request', (request) => {
        if (isDashboardChartRequest(request)) {
            requests.push(request);
        }
    });
    return requests;
};

const cleanupDashboard = async (
    request: APIRequestContext,
    dashboardUuid: string,
) => {
    const deleteResponse = await request.delete(
        dashboardApiPath(dashboardUuid),
    );
    const verificationResponse = await request.get(
        dashboardApiPath(dashboardUuid),
    );

    return {
        dashboardUuid,
        deleteStatus: deleteResponse.status(),
        verificationStatus: verificationResponse.status(),
    };
};

const uniqueDashboardName = (baseName: string) => `${baseName} ${randomUUID()}`;

const expectDashboardUnlocked = async (page: Page) => {
    await expect(
        page.getByTestId('unmet-requirements-placeholder'),
    ).toHaveCount(0);
    await expect(page.locator('.echarts-for-react')).toHaveCount(1);
};

const closeAutoOpenListbox = async (page: Page) => {
    const listbox = page.getByRole('listbox');
    await expect(listbox).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(listbox).toHaveCount(0);
};

test.describe('Dashboard filter required groups', { tag: '@mutating' }, () => {
    test.afterEach(async ({ request }) => {
        const dashboardUuids = [...createdDashboardUuids];
        createdDashboardUuids.clear();

        const cleanupResults = await Promise.all(
            dashboardUuids.map((dashboardUuid) =>
                cleanupDashboard(request, dashboardUuid),
            ),
        );

        cleanupResults.forEach((result) => {
            expect(
                result.deleteStatus,
                `cleanup status for dashboard ${result.dashboardUuid}`,
            ).toBe(200);
            expect(
                result.verificationStatus,
                `inactive status for dashboard ${result.dashboardUuid}`,
            ).toBe(404);
        });
    });

    test('locks the dashboard until any filter in the required group has a value', async ({
        page,
        request,
    }) => {
        const dashboardUuid = await createDashboardWithFilters(
            request,
            uniqueDashboardName(GROUP_DASHBOARD_NAME),
            [
                paymentMethodFilter({ requiredGroupId: 'g1' }),
                orderStatusFilter({ requiredGroupId: 'g1' }),
            ],
        );
        const chartRequests = collectDashboardChartRequests(page);

        await page.goto(dashboardViewPath(dashboardUuid));

        const guidedSetupDialog = getGuidedSetupDialog(page);
        const guidedSetup = guidedSetupDialog.getByTestId(
            'guided-filter-setup',
        );
        const unmetRequirements = page.getByTestId(
            'unmet-requirements-placeholder',
        );
        await expect(guidedSetup).toBeVisible();
        await expect(unmetRequirements).toBeVisible();
        await expect(
            page.getByText('Loading chart', { exact: true }),
        ).toHaveCount(0);
        await expect(page.locator('.echarts-for-react')).toHaveCount(0);
        expect(chartRequests).toHaveLength(0);

        await closeAutoOpenListbox(page);
        await guidedSetupDialog
            .getByRole('button', {
                name: 'Set filters in the toolbar instead',
                exact: true,
            })
            .click();
        await expect(guidedSetup).toHaveCount(0);
        await expect(unmetRequirements).toBeVisible();

        const paymentMethodChip = page
            .getByRole('button', {
                name: 'Payment method is any value',
                exact: true,
            })
            .and(page.locator('button'));
        await paymentMethodChip.press('Enter');
        const paymentMethodPopover = page.getByRole('dialog', {
            name: 'Payment method is any value',
            exact: true,
        });
        await expect(paymentMethodPopover).toBeVisible();
        await paymentMethodPopover
            .getByPlaceholder('any value', { exact: true })
            .fill('credit_card');
        await page
            .getByRole('option', { name: 'credit_card', exact: true })
            .click();

        const chartRequestPromise = page.waitForRequest(
            isDashboardChartRequest,
        );
        await paymentMethodPopover
            .getByRole('button', { name: 'Apply', exact: true })
            .click();
        await chartRequestPromise;

        await expectDashboardUnlocked(page);
        await expect(
            page.getByText('Loading chart', { exact: true }),
        ).toHaveCount(0);
    });

    test('completes setup through the guided card and unlocks live', async ({
        page,
        request,
    }) => {
        const dashboardUuid = await createDashboardWithFilters(
            request,
            uniqueDashboardName(GUIDED_DASHBOARD_NAME),
            [
                paymentMethodFilter({ required: true }),
                orderStatusFilter({ requiredGroupId: 'g1' }),
            ],
            {
                isDateZoomDisabled: false,
                requiredFiltersNote: GUIDED_SETUP_NOTE,
            },
        );
        collectDashboardChartRequests(page);
        const paymentValuesSearchResponsePromise = page.waitForResponse(
            (response) =>
                isPostRequestTo(response.request(), paymentMethodSearchPath),
        );

        await page.goto(dashboardViewPath(dashboardUuid));
        const paymentValuesSearchResponse =
            await paymentValuesSearchResponsePromise;
        expect(
            paymentValuesSearchResponse.status(),
            'payment method values search response status',
        ).toBe(200);

        const guidedSetupDialog = getGuidedSetupDialog(page);
        const guidedSetup = guidedSetupDialog.getByTestId(
            'guided-filter-setup',
        );
        await expect(guidedSetup).toBeVisible();
        await expect(
            guidedSetupDialog.getByText(GUIDED_SETUP_NOTE, { exact: true }),
        ).toBeVisible();
        await closeAutoOpenListbox(page);
        await expect(
            guidedSetupDialog.getByText('0 of 2 set', { exact: true }),
        ).toBeVisible();

        const paymentMethodRule = guidedSetup.locator(
            '[data-rule-id="e2e-payment-method-filter"]',
        );
        await expect(
            paymentMethodRule.getByText('Payment method', { exact: true }),
        ).toBeVisible();
        const paymentMethodInput = paymentMethodRule.getByPlaceholder(
            'any value',
            { exact: true },
        );
        await expect(paymentMethodInput).toHaveCount(1);
        await expect(paymentMethodInput).toBeEnabled();
        await paymentMethodInput.click();
        await paymentMethodInput.fill('credit_card');
        await page
            .getByRole('option', { name: 'credit_card', exact: true })
            .click();

        await expect(
            guidedSetupDialog.getByText('1 of 2 set', { exact: true }),
        ).toBeVisible();
        await expect(
            guidedSetup.getByText('Change', { exact: true }),
        ).toBeVisible();
        await expect(
            guidedSetup.getByText('is credit_card', { exact: true }),
        ).toBeVisible();

        const orderStatusInput = guidedSetup.getByPlaceholder('any value', {
            exact: true,
        });
        await expect(orderStatusInput).toHaveCount(1);
        await orderStatusInput.click();
        const chartRequestPromise = page.waitForRequest(
            isDashboardChartRequest,
        );
        await page
            .getByRole('option', { name: 'Completed order', exact: true })
            .click({ timeout: 15_000 });

        await Promise.all([
            expect(guidedSetup).toHaveCount(0),
            chartRequestPromise,
        ]);
        await expectDashboardUnlocked(page);
    });

    test('locks a dashboard with a singleton required filter and shows the guided card', async ({
        page,
        request,
    }) => {
        const dashboardUuid = await createDashboardWithFilters(
            request,
            uniqueDashboardName(SINGLE_DASHBOARD_NAME),
            [paymentMethodFilter({ required: true })],
        );
        const chartRequests = collectDashboardChartRequests(page);

        await page.goto(dashboardViewPath(dashboardUuid));

        await expect(
            page.getByTestId('unmet-requirements-placeholder'),
        ).toBeVisible();
        const guidedSetupDialog = getGuidedSetupDialog(page);
        const guidedSetup = guidedSetupDialog.getByTestId(
            'guided-filter-setup',
        );
        await expect(guidedSetup).toBeVisible();
        await closeAutoOpenListbox(page);
        await expect(
            guidedSetupDialog.getByText('0 of 1 set', { exact: true }),
        ).toBeVisible();
        expect(chartRequests).toHaveLength(0);
    });
});
