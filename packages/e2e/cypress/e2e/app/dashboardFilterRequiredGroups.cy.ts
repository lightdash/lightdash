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

        // Locked: the banner lists the rule members as clickable name tags
        cy.findByText('To load data, set these filters:').should('be.visible');
        cy.findByText('at least one of').should('be.visible');

        // Tiles show the locked skeleton placeholder: no chart rendered or loading
        cy.findAllByTestId('locked-tile-placeholder').should('exist');
        cy.findAllByText('Loading chart').should('have.length', 0);
        cy.get('.echarts-for-react').should('not.exist');

        // No chart query ran while locked
        cy.get('@chartQuery.all').should('have.length', 0);

        // Set a value on ONE member of the group via its filter pill
        cy.contains('button', 'Payment method').click();
        cy.findByPlaceholderText('Start typing to filter results').type(
            'credit_card',
        );
        cy.findByRole('option', { name: 'credit_card' }).click();
        cy.contains('button', 'Apply').click({ force: true });

        // Unlocked: banner gone, tile runs its query and renders
        cy.contains('To load data').should('not.exist');
        cy.wait('@chartQuery');
        cy.findAllByTestId('locked-tile-placeholder').should('have.length', 0);
        cy.findAllByText('Loading chart').should('have.length', 0);
        cy.get('.echarts-for-react').should('exist');
    });

    it('still locks and unlocks a dashboard with a singleton required filter', () => {
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

        // Locked with a plain name tag, no "at least one of" prefix
        cy.findByText('To load data, set this filter:').should('be.visible');
        cy.contains('at least one of').should('not.exist');

        cy.findAllByTestId('locked-tile-placeholder').should('exist');
        cy.get('@chartQuery.all').should('have.length', 0);

        // Setting a value on the required filter unlocks the dashboard
        cy.contains('button', 'Payment method').click();
        cy.findByPlaceholderText('Start typing to filter results').type(
            'credit_card',
        );
        cy.findByRole('option', { name: 'credit_card' }).click();
        cy.contains('button', 'Apply').click({ force: true });

        cy.contains('To load data').should('not.exist');
        cy.wait('@chartQuery');
        cy.findAllByTestId('locked-tile-placeholder').should('have.length', 0);
        cy.findAllByText('Loading chart').should('have.length', 0);
        cy.get('.echarts-for-react').should('exist');
    });
});
