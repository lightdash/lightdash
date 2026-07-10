// Requires the dashboard-filter-requirements feature flag on the server
// under test (e.g. LIGHTDASH_ENABLE_FEATURE_FLAGS=dashboard-filter-requirements);
// with the flag off, dashboards fall back to the legacy locked modal.
import {
    ApiChartSummaryListResponse,
    CreateDashboard,
    DashboardFilterRule,
    DashboardTileTypes,
    FilterOperator,
    SEED_PROJECT,
} from '@lightdash/common';

const GROUP_DASHBOARD_NAME = 'e2e dashboard with filter requirement group';
const SINGLE_DASHBOARD_NAME = 'e2e dashboard with single required filter';
const GUIDED_DASHBOARD_NAME = 'e2e dashboard with guided filter setup';

const GUIDED_SETUP_NOTE = 'Pick your region to keep this dashboard fast.';

const CHART_NAME = 'How much revenue do we have per payment method?';

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

const createDashboardWithFilters = (
    name: string,
    dimensionFilters: DashboardFilterRule[],
    config?: CreateDashboard['config'],
): Cypress.Chainable<string> =>
    cy
        .request<ApiChartSummaryListResponse>(
            `api/v1/projects/${SEED_PROJECT.project_uuid}/charts`,
        )
        .then((chartsResponse) => {
            expect(chartsResponse.status).to.eq(200);
            const chart = chartsResponse.body.results.find(
                ({ name: chartName }) => chartName === CHART_NAME,
            );
            expect(chart, `chart "${CHART_NAME}" in seed project`).to.not.eq(
                undefined,
            );

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
                            savedChartUuid: chart!.uuid,
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

            return cy
                .request({
                    url: `api/v1/projects/${SEED_PROJECT.project_uuid}/dashboards`,
                    method: 'POST',
                    headers: { 'Content-type': 'application/json' },
                    body,
                })
                .then((createResponse) => {
                    expect(createResponse.status).to.eq(201);
                    return cy.wrap<string>(createResponse.body.results.uuid);
                });
        });

describe('Dashboard filter required groups', () => {
    beforeEach(() => {
        cy.login();
    });

    after(() => {
        cy.login();
        cy.deleteDashboardsByName([
            GROUP_DASHBOARD_NAME,
            SINGLE_DASHBOARD_NAME,
            GUIDED_DASHBOARD_NAME,
        ]);
    });

    it('locks the dashboard until any filter in the required group has a value', () => {
        cy.intercept('POST', '**/api/v2/projects/*/query/dashboard-chart').as(
            'chartQuery',
        );

        createDashboardWithFilters(GROUP_DASHBOARD_NAME, [
            paymentMethodFilter({ requiredGroupId: 'g1' }),
            orderStatusFilter({ requiredGroupId: 'g1' }),
        ]).then((dashboardUuid) => {
            cy.visit(
                `/projects/${SEED_PROJECT.project_uuid}/dashboards/${dashboardUuid}/view`,
            );
        });

        // Locked: an any-of rule qualifies for the guided setup card
        cy.findByTestId('guided-filter-setup').should('be.visible');

        // Tiles show the locked skeleton placeholder: no chart rendered or loading
        cy.findAllByTestId('unmet-requirements-placeholder').should('exist');
        cy.findAllByText('Loading chart').should('have.length', 0);
        cy.get('.echarts-for-react').should('not.exist');

        // No chart query ran while locked
        cy.get('@chartQuery.all').should('have.length', 0);

        // The escape hatch dismisses the card; the yellow required chips in the
        // toolbar remain the only affordance
        cy.findByText('Set filters in the toolbar instead').click();
        cy.findByTestId('guided-filter-setup').should('not.exist');
        cy.findAllByTestId('unmet-requirements-placeholder').should('exist');

        // Set a value on ONE member of the group via its filter pill
        cy.contains('button', 'Payment method').click();
        cy.findByPlaceholderText('any value').type('credit_card');
        cy.findByRole('option', { name: 'credit_card' }).click();
        cy.contains('button', 'Apply').click({ force: true });

        // Unlocked: tile runs its query and renders
        cy.wait('@chartQuery');
        cy.findAllByTestId('unmet-requirements-placeholder').should(
            'have.length',
            0,
        );
        cy.findAllByText('Loading chart').should('have.length', 0);
        cy.get('.echarts-for-react').should('exist');
    });

    it('completes setup through the guided card and unlocks live', () => {
        cy.intercept('POST', '**/api/v2/projects/*/query/dashboard-chart').as(
            'chartQuery',
        );
        // The card's focused autocomplete is disabled while its initial
        // field-values search is in flight; wait for it before typing
        cy.intercept('POST', '**/field/payments_payment_method/search').as(
            'paymentValuesSearch',
        );

        createDashboardWithFilters(
            GUIDED_DASHBOARD_NAME,
            [
                paymentMethodFilter({ required: true }),
                orderStatusFilter({ requiredGroupId: 'g1' }),
            ],
            {
                isDateZoomDisabled: false,
                requiredFiltersNote: GUIDED_SETUP_NOTE,
            },
        ).then((dashboardUuid) => {
            cy.visit(
                `/projects/${SEED_PROJECT.project_uuid}/dashboards/${dashboardUuid}/view`,
            );
        });

        // Two rules qualify for the card; the editor note is its subtitle
        cy.wait('@paymentValuesSearch');
        cy.findByTestId('guided-filter-setup').within(() => {
            cy.findByText(GUIDED_SETUP_NOTE).should('be.visible');
            cy.findByText('0 of 2 set').should('be.visible');

            // Set the first rule (Payment method) from the card
            cy.findAllByPlaceholderText('any value')
                .first()
                .should('be.enabled')
                .type('credit_card');
        });
        // Autocomplete options render in a portal outside the card
        cy.findByRole('option', { name: 'credit_card' }).click();

        // The satisfied rule collapses to a summary line with a Change link
        cy.findByTestId('guided-filter-setup').within(() => {
            cy.findByText('1 of 2 set').should('be.visible');
            cy.findByText('Change').should('be.visible');
            // Both the summary line and the tag input render the value
            cy.findAllByText('credit_card').first().should('be.visible');

            // Open the second rule's input (Order status); its field values
            // load on focus, so pick from the option list instead of typing
            cy.findAllByPlaceholderText('any value').first().click();
        });
        // Autocomplete options render in a portal outside the card
        cy.findByRole('option', {
            name: 'Completed order',
            timeout: 15000,
        }).click();

        // All rules met: the card unmounts and the dashboard loads live
        cy.findByTestId('guided-filter-setup').should('not.exist');
        cy.wait('@chartQuery');
        cy.findAllByTestId('unmet-requirements-placeholder').should(
            'have.length',
            0,
        );
        cy.get('.echarts-for-react').should('exist');
    });

    it('locks a dashboard with a singleton required filter and shows the guided card', () => {
        cy.intercept('POST', '**/api/v2/projects/*/query/dashboard-chart').as(
            'chartQuery',
        );

        createDashboardWithFilters(SINGLE_DASHBOARD_NAME, [
            paymentMethodFilter({ required: true }),
        ]).then((dashboardUuid) => {
            cy.visit(
                `/projects/${SEED_PROJECT.project_uuid}/dashboards/${dashboardUuid}/view`,
            );
        });

        // A required filter is a one-member rule, so it also qualifies for
        // the guided card. Tiles stay blocked and no chart query runs. The
        // chip unlock flow is covered by the group test above.
        cy.findAllByTestId('unmet-requirements-placeholder').should('exist');
        cy.findByTestId('guided-filter-setup').should('be.visible');
        cy.findByText('0 of 1 set').should('be.visible');
        cy.get('@chartQuery.all').should('have.length', 0);
    });
});
