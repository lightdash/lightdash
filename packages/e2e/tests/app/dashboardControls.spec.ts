import {
    DashboardTileTypes,
    FeatureFlags,
    FilterOperator,
    interpolateUiString,
    DEFAULT_UI_STRINGS as S,
    SEED_PROJECT,
    type ApiChartSummaryListResponse,
    type CreateDashboard,
    type Dashboard,
    type DashboardFilterRule,
} from '@lightdash/common';
import {
    expect,
    json,
    loginAs,
    logout,
    SEED_USERS,
    test,
    type Credentials,
    type Locator,
    type Page,
    type TrackedApi,
} from '../../support/test';

const TILE_CHARTS = [
    'How much revenue do we have per payment method?',
    "What's our total revenue to date?",
    'How many orders we have over time ?',
];

const paymentMethodFilter = (
    overrides: Partial<DashboardFilterRule> = {},
): DashboardFilterRule => ({
    id: 'e2e-controls-payment-method',
    label: 'Payment method',
    target: { fieldId: 'payments_payment_method', tableName: 'payments' },
    operator: FilterOperator.EQUALS,
    values: ['credit_card'],
    ...overrides,
});

const orderStatusFilter: DashboardFilterRule = {
    id: 'e2e-controls-order-status',
    label: 'Order status',
    target: { fieldId: 'orders_status', tableName: 'orders' },
    operator: FilterOperator.EQUALS,
    values: ['completed'],
};

// Three tiles: the payment method field is on two, order status on all three.
const createDashboard = async (
    api: TrackedApi,
    name: string,
    dimensions: DashboardFilterRule[],
): Promise<string> => {
    const charts = await json<ApiChartSummaryListResponse['results']>(
        await api.get(`/api/v1/projects/${SEED_PROJECT.project_uuid}/charts`),
    );
    const tiles: CreateDashboard['tiles'] = TILE_CHARTS.map(
        (chartName, index) => {
            const chart = charts.find((c) => c.name === chartName);
            if (!chart) throw new Error(`Missing chart "${chartName}"`);
            return {
                type: DashboardTileTypes.SAVED_CHART,
                x: (index % 2) * 18,
                y: Math.floor(index / 2) * 9,
                w: 18,
                h: 9,
                tabUuid: null,
                properties: { savedChartUuid: chart.uuid },
            };
        },
    );
    const response = await api.post(
        `/api/v1/projects/${SEED_PROJECT.project_uuid}/dashboards`,
        {
            data: {
                name: `${name} ${Date.now()}`,
                tiles,
                filters: { dimensions, metrics: [], tableCalculations: [] },
                tabs: [],
            } satisfies CreateDashboard,
        },
    );
    expect(response.status()).toBe(201);
    return (await json<{ uuid: string }>(response)).uuid;
};

const getSavedFilter = async (
    api: TrackedApi,
    dashboardUuid: string,
    filterId: string,
) => {
    const dashboard = await json<Dashboard>(
        await api.get(`/api/v1/dashboards/${dashboardUuid}`),
    );
    return dashboard.filters.dimensions.find(({ id }) => id === filterId);
};

// The flag only gates the frontend, so the page's own flag request decides it;
// an org override would also flip the flag-off dashboard specs running beside this one
const setDashboardControls = (page: Page, enabled: boolean) =>
    page.route(
        `**/api/v2/feature-flag/${FeatureFlags.DashboardControls}`,
        (route) =>
            route.fulfill({
                json: {
                    status: 'ok',
                    results: { id: FeatureFlags.DashboardControls, enabled },
                },
            }),
    );

const openDashboard = async (
    page: Page,
    dashboardUuid: string,
    mode: 'view' | 'edit',
) => {
    await page.goto(
        `/projects/${SEED_PROJECT.project_uuid}/dashboards/${dashboardUuid}/${mode}`,
    );
    await expect(page.locator('[data-controls-pill]').first()).toBeVisible();
};

const pill = (page: Page, filterId: string) =>
    page.locator(`[data-controls-pill="${filterId}"]`);

const editor = (page: Page, label: string) =>
    page.getByRole('dialog', { name: label });

const openEditor = async (page: Page, filterId: string, label: string) => {
    await pill(page, filterId).click();
    const dialog = editor(page, label);
    await expect(dialog).toBeVisible();
    return dialog;
};

// A pick closes the value list, so it never covers the footer
const expectValueListClosed = (page: Page) =>
    expect(page.getByRole('listbox')).toBeHidden();

const replaceValue = async (
    page: Page,
    dialog: Locator,
    from: string,
    to: string,
) => {
    await dialog.getByRole('button', { name: `Remove ${from}` }).click();
    const input = dialog.getByRole('textbox');
    await input.fill(to);
    await page.getByRole('option', { name: to, exact: true }).click();
    await expect(
        dialog.getByRole('button', { name: `Remove ${to}` }),
    ).toBeVisible();
    await expectValueListClosed(page);
};

// Leave the page first: its in-flight requests would replace the new session cookie
const switchUser = async (page: Page, api: TrackedApi, user: Credentials) => {
    await page.goto('about:blank');
    await logout(api.raw);
    await loginAs(api.raw, user);
};

const apply = (dialog: Locator) =>
    dialog.getByRole('button', { name: S['filters.apply'], exact: true });

const saveButton = (page: Page) =>
    page.getByRole('button', { name: 'Save dashboard' });

test.describe('Dashboard controls', () => {
    test.beforeEach(async ({ api }) => {
        await loginAs(api.raw, SEED_USERS.admin);
    });

    test('the flag the test sets decides the filter bar', async ({
        api,
        page,
    }) => {
        const uuid = await createDashboard(api, 'e2e controls flag', [
            paymentMethodFilter(),
        ]);
        await setDashboardControls(page, false);
        await page.goto(
            `/projects/${SEED_PROJECT.project_uuid}/dashboards/${uuid}/view`,
        );
        await expect(
            page.locator('button', { hasText: 'Payment method' }).first(),
        ).toHaveText('Payment method is credit_card');
        await expect(page.locator('[data-controls-pill]')).toHaveCount(0);

        await page.unrouteAll();
        await setDashboardControls(page, true);
        await openDashboard(page, uuid, 'view');
        await expect(pill(page, 'e2e-controls-payment-method')).toBeVisible();
    });

    test('view mode: Apply a new value, then Reset restores it', async ({
        api,
        page,
    }) => {
        const uuid = await createDashboard(api, 'e2e controls view', [
            paymentMethodFilter(),
        ]);
        await setDashboardControls(page, true);
        await openDashboard(page, uuid, 'view');

        const filterPill = pill(page, 'e2e-controls-payment-method');
        const reset = page.getByRole('button', { name: S['filters.resetAll'] });
        await expect(filterPill).toHaveText('Payment method is credit_card');
        await expect(reset).toHaveCount(0);

        const dialog = await openEditor(
            page,
            'e2e-controls-payment-method',
            'Payment method',
        );
        await replaceValue(page, dialog, 'credit_card', 'coupon');
        await apply(dialog).click();

        await expect(dialog).toHaveCount(0);
        await expect(filterPill).toHaveText('Payment method is coupon');
        await expect(filterPill).toHaveAttribute('data-in-effect', 'true');
        await expect(filterPill.getByText('coupon', { exact: true })).toHaveCSS(
            'font-weight',
            '600',
        );

        await reset.click();
        await expect(filterPill).toHaveText('Payment method is credit_card');
        await expect(reset).toHaveCount(0);
    });

    test('edit mode: Apply enables Save, and Save persists the value', async ({
        api,
        page,
    }) => {
        const uuid = await createDashboard(api, 'e2e controls edit', [
            paymentMethodFilter(),
        ]);
        await setDashboardControls(page, true);
        await openDashboard(page, uuid, 'edit');

        await expect(page.getByText('Editing', { exact: true })).toBeVisible();
        await expect(saveButton(page)).toBeDisabled();

        const dialog = await openEditor(
            page,
            'e2e-controls-payment-method',
            'Payment method',
        );
        await replaceValue(page, dialog, 'credit_card', 'coupon');
        await apply(dialog).click();
        await expect(dialog).toHaveCount(0);
        await expect(saveButton(page)).toBeEnabled();

        const saved = page.waitForResponse(
            (response) =>
                response.request().method() === 'PATCH' &&
                response.url().includes(`/dashboards/${uuid}`),
        );
        await saveButton(page).click();
        expect((await saved).status()).toBe(200);
        await expect(
            page.getByRole('button', { name: 'Edit dashboard' }),
        ).toBeVisible();
        await expect(page).toHaveURL(/\/view/);

        await page.reload();
        await expect(pill(page, 'e2e-controls-payment-method')).toHaveText(
            'Payment method is coupon',
        );
        expect(
            (await getSavedFilter(api, uuid, 'e2e-controls-payment-method'))
                ?.values,
        ).toEqual(['coupon']);
    });

    test('switching filters with a change asks first, Discard opens the other', async ({
        api,
        page,
    }) => {
        const uuid = await createDashboard(api, 'e2e controls switch', [
            paymentMethodFilter(),
            orderStatusFilter,
        ]);
        await setDashboardControls(page, true);
        await openDashboard(page, uuid, 'edit');

        const dialog = await openEditor(
            page,
            'e2e-controls-payment-method',
            'Payment method',
        );
        await dialog
            .getByRole('button', { name: 'Remove credit_card' })
            .click();
        await pill(page, 'e2e-controls-order-status').click();

        await expect(
            dialog.getByRole('status').filter({
                hasText: interpolateUiString(
                    S['filters.rail.applyChangesFirst'],
                    { filter: 'Payment method' },
                ),
            }),
        ).toBeVisible();
        await dialog
            .getByRole('button', { name: S['filters.rail.discard'] })
            .click();

        await expect(editor(page, 'Order status')).toBeVisible();
        await expect(dialog).toHaveCount(0);
        await expect(pill(page, 'e2e-controls-payment-method')).toHaveText(
            'Payment method is credit_card',
        );
    });

    test('new filter: picker first, a dashed draft pill, Cancel reverts', async ({
        api,
        page,
    }) => {
        const uuid = await createDashboard(api, 'e2e controls new', [
            paymentMethodFilter(),
        ]);
        await setDashboardControls(page, true);
        await openDashboard(page, uuid, 'edit');

        await page
            .getByRole('button', { name: S['filters.addFilter'] })
            .click();
        const picker = editor(page, S['filters.rail.newFilter']);
        await expect(
            picker.getByRole('textbox', {
                name: S['filters.rail.searchFields'],
            }),
        ).toBeFocused();
        await expect(picker.getByRole('button')).toHaveCount(0);

        await page.keyboard.type('First name');
        await page.getByRole('option', { name: 'First name' }).first().click();

        const dialog = editor(page, 'First name');
        await expect(dialog).toBeVisible();
        const draft = page.locator('[data-controls-pill][data-temporary]');
        await expect(draft).toHaveCount(1);
        await expect(draft).toHaveAttribute('data-open', /.*/);

        await dialog.getByRole('textbox').fill('Michael');
        await page
            .getByRole('option', { name: 'Michael', exact: true })
            .click();
        await expectValueListClosed(page);
        await apply(dialog).click();

        await expect(dialog).toHaveCount(0);
        await expect(draft).toHaveText('First name is Michael');
        await expect(saveButton(page)).toBeEnabled();

        await page.getByRole('button', { name: 'Cancel', exact: true }).click();
        await expect(
            page.getByRole('button', { name: 'Edit dashboard' }),
        ).toBeVisible();
        await expect(page.locator('[data-controls-pill]')).toHaveCount(1);
        await expect(page.getByText('First name is Michael')).toHaveCount(0);
    });

    test('mapping: choose tiles, change them from a tile and the bar', async ({
        api,
        page,
    }) => {
        const uuid = await createDashboard(api, 'e2e controls mapping', [
            paymentMethodFilter(),
            orderStatusFilter,
        ]);
        await setDashboardControls(page, true);
        await openDashboard(page, uuid, 'edit');

        const chooseTiles = async () => {
            const dialog = await openEditor(
                page,
                'e2e-controls-payment-method',
                'Payment method',
            );
            await dialog.getByRole('button', { name: 'Choose tiles' }).click();
            await expect(dialog).toHaveCount(0);
        };
        await chooseTiles();

        const row = page.getByTestId('controls-mapping-row');
        await expect(row).toBeVisible();
        await expect(row).toContainText('2 of 3');
        // The filter row stays in place, faded and inert
        await expect(
            page.locator(
                '[inert] [data-controls-pill="e2e-controls-order-status"]',
            ),
        ).toHaveCount(1);

        const chip = row.getByRole('button', {
            name: 'Payments Payment method',
            exact: true,
        });
        await chip.click();
        await expect(chip).toHaveAttribute('aria-pressed', 'true');
        const bar = page.getByRole('region', {
            name: interpolateUiString(S['filters.fieldBar.region'], {
                field: 'Payments Payment method',
            }),
        });
        await expect(bar).toContainText('2 of 2');
        await expect(
            bar.getByRole('button', { name: S['filters.fieldBar.undo'] }),
        ).toBeDisabled();
        const filterAll = bar.getByRole('button', {
            name: S['filters.fieldBar.filterAllTiles'],
        });
        await expect(filterAll).toBeDisabled();
        const clearPaymentMethod = bar.getByRole('button', {
            name: interpolateUiString(S['filters.fieldBar.clearName'], {
                field: 'Payments Payment method',
            }),
        });
        // Its only field: clearing it would leave the filter on no tile
        await expect(clearPaymentMethod).toBeDisabled();

        // Clear on a tile card
        await page
            .getByRole('button', { name: S['filters.tileCard.stopFiltering'] })
            .first()
            .click();
        await expect(bar).toContainText('1 of 2');
        await expect(row).toContainText('1 of 3');

        // Filter all tiles, then Undo it
        await filterAll.click();
        await expect(bar).toContainText('2 of 2');
        await bar
            .getByRole('button', {
                name: /^Undo filtering .+ by Payments Payment method$/,
            })
            .click();
        await expect(bar).toContainText('1 of 2');

        // A second field makes the bar's Clear available
        await row.getByRole('button', { name: 'Add a field' }).click();
        await expect(
            page
                .getByRole('dialog', { name: 'Add a field' })
                .getByPlaceholder(S['filters.rail.searchFields']),
        ).toBeFocused();
        await page.keyboard.type('Status');
        await page
            .getByRole('option', { name: 'Status', exact: true })
            .first()
            .click();
        await expect(
            row.getByRole('button', { name: 'Orders Status', exact: true }),
        ).toHaveAttribute('aria-pressed', 'true');
        await chip.click();
        await expect(clearPaymentMethod).toBeEnabled();
        await clearPaymentMethod.click();
        await expect(chip).toHaveCount(0);

        // Row Cancel returns to the popover
        await row
            .getByRole('button', { name: S['filters.actions.cancel'] })
            .click();
        await expect(row).toHaveCount(0);
        await expect(editor(page, 'Payment method')).toBeVisible();
        await expect(page.locator('[inert] [data-controls-pill]')).toHaveCount(
            0,
        );
        await editor(page, 'Payment method')
            .getByRole('button', { name: S['filters.actions.cancel'] })
            .click();
        await expect(editor(page, 'Payment method')).toHaveCount(0);

        // Row Apply returns to the filter row
        await chooseTiles();
        await row.locator('[data-controls-apply]').click();
        await expect(row).toHaveCount(0);
        await expect(editor(page, 'Payment method')).toHaveCount(0);
        await expect(page.locator('[inert] [data-controls-pill]')).toHaveCount(
            0,
        );
        await expect(pill(page, 'e2e-controls-order-status')).toBeVisible();
    });

    test('a required filter keeps its default on Save', async ({
        api,
        page,
    }) => {
        const uuid = await createDashboard(api, 'e2e controls required', [
            paymentMethodFilter({ required: true }),
        ]);
        await setDashboardControls(page, true);
        await openDashboard(page, uuid, 'edit');

        const dialog = await openEditor(
            page,
            'e2e-controls-payment-method',
            'Payment method',
        );
        await replaceValue(page, dialog, 'credit_card', 'coupon');
        await apply(dialog).click();

        const saved = page.waitForResponse(
            (response) =>
                response.request().method() === 'PATCH' &&
                response.url().includes(`/dashboards/${uuid}`),
        );
        await saveButton(page).click();
        expect((await saved).status()).toBe(200);

        const filter = await getSavedFilter(
            api,
            uuid,
            'e2e-controls-payment-method',
        );
        expect(filter?.required).toBe(true);
        expect(filter?.values).toEqual(['coupon']);
    });

    test('the eye item decides whether viewers can add filters', async ({
        api,
        page,
    }) => {
        const uuid = await createDashboard(api, 'e2e controls viewers', [
            paymentMethodFilter(),
        ]);
        await setDashboardControls(page, true);
        const addFilter = page.getByRole('button', {
            name: S['filters.addFilter'],
        });

        await loginAs(api.raw, SEED_USERS.viewer);
        await openDashboard(page, uuid, 'view');
        await expect(addFilter).toBeVisible();

        await switchUser(page, api, SEED_USERS.admin);
        await openDashboard(page, uuid, 'edit');
        await page.getByRole('button', { name: 'Filter bar settings' }).click();
        await page.getByRole('menuitem', { name: 'Hide for viewers' }).click();
        await page.getByRole('button', { name: 'Filter bar settings' }).click();
        await expect(
            page.getByRole('menuitem', { name: 'Show for viewers' }),
        ).toBeVisible();
        await page.keyboard.press('Escape');
        await saveButton(page).click();
        await expect(
            page.getByRole('button', { name: 'Edit dashboard' }),
        ).toBeVisible();

        await switchUser(page, api, SEED_USERS.viewer);
        await openDashboard(page, uuid, 'view');
        await expect(addFilter).toHaveCount(0);
    });
});
