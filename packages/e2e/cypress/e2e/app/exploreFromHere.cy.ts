import {
    ChartType,
    CustomDimensionType,
    DimensionType,
    SEED_PROJECT,
    type CreateChartInSpace,
    type SavedChart,
} from '@lightdash/common';

/* eslint-disable no-template-curly-in-string */
const customSqlDim = {
    id: 'efh_custom_sql_dim',
    name: 'efh custom sql dim',
    type: CustomDimensionType.SQL as const,
    table: 'orders',
    sql: '${orders.amount}',
    dimensionType: DimensionType.NUMBER,
};

const sqlTableCalc = {
    name: 'efh_sql_calc',
    displayName: 'efh sql calc',
    // Reference a dim that's actually in the metricQuery so the calc compiles.
    sql: '${orders.status}',
    type: 'string' as const,
};
/* eslint-enable no-template-curly-in-string */

const buildChartBody = (spaceUuid: string): CreateChartInSpace => ({
    name: 'Explore-from-here gating fixture',
    description:
        'Created by exploreFromHere.cy.ts — has SQL custom dim + SQL table calc',
    tableName: 'orders',
    spaceUuid,
    metricQuery: {
        exploreName: 'orders',
        dimensions: [customSqlDim.id, 'orders_status'],
        metrics: ['orders_total_order_amount'],
        filters: {},
        sorts: [],
        limit: 500,
        tableCalculations: [sqlTableCalc],
        additionalMetrics: [],
        customDimensions: [customSqlDim],
    } as CreateChartInSpace['metricQuery'],
    chartConfig: {
        type: ChartType.TABLE,
        config: { showColumnCalculation: true } as Record<string, unknown>,
    } as CreateChartInSpace['chartConfig'],
    tableConfig: { columnOrder: [] },
});

const buildOldStyleUrl = (projectUuid: string, chart: SavedChart): string => {
    const params = new URLSearchParams();
    params.set(
        'create_saved_chart_version',
        JSON.stringify({
            uuid: chart.uuid,
            projectUuid,
            tableName: chart.tableName,
            metricQuery: chart.metricQuery,
            chartConfig: chart.chartConfig,
            tableConfig: chart.tableConfig,
        }),
    );
    params.set('isExploreFromHere', 'true');
    return `/projects/${projectUuid}/tables/${chart.tableName}?${params.toString()}`;
};

describe('Explore from here — SQL bodies must not leak into the URL', () => {
    let chart: SavedChart;
    let spaceUuid: string;

    before(() => {
        cy.login();
        // Public space (inherits org/project access) so the seed editor user
        // can see the chart without needing a direct grant.
        cy.request({
            method: 'POST',
            url: `/api/v1/projects/${SEED_PROJECT.project_uuid}/spaces/`,
            body: {
                name: `EFH gate ${Date.now()}`,
                inheritParentPermissions: true,
            },
        })
            .then((resp) => {
                expect(resp.status).to.eq(200);
                spaceUuid = resp.body.results.uuid;
                return cy.createChartInSpace(
                    SEED_PROJECT.project_uuid,
                    buildChartBody(spaceUuid),
                );
            })
            .then((createdChart) => {
                chart = createdChart as unknown as SavedChart;
            });
    });

    describe('Admin (manage:CustomFields)', () => {
        beforeEach(() => {
            cy.login();
        });

        it('preserves SQL bodies in the URL — round-trip is intact', () => {
            cy.intercept('POST', '/api/v1/share').as('createShare');
            cy.visit(
                `/projects/${SEED_PROJECT.project_uuid}/saved/${chart.uuid}/view`,
            );
            cy.findByText('Explore from here', { timeout: 15000 }).click();

            cy.wait('@createShare')
                .its('request.body')
                .then((body) => {
                    const decoded = decodeURIComponent(body.params);
                    expect(decoded).to.contain(customSqlDim.sql);
                    expect(decoded).to.contain(sqlTableCalc.sql);
                    expect(decoded).to.contain('savedChartUuid=');
                });
        });
    });

    describe('Editor (no manage:CustomFields)', () => {
        beforeEach(() => {
            cy.loginAsEditor();
        });

        it('strips SQL bodies and carries savedChartUuid in the share payload', () => {
            cy.intercept('POST', '/api/v1/share').as('createShare');
            cy.visit(
                `/projects/${SEED_PROJECT.project_uuid}/saved/${chart.uuid}/view`,
            );
            cy.findByText('Explore from here', { timeout: 15000 }).click();

            cy.wait('@createShare')
                .its('request.body')
                .then((body) => {
                    const decoded = decodeURIComponent(body.params);
                    expect(decoded).to.not.contain(customSqlDim.sql);
                    expect(decoded).to.not.contain(sqlTableCalc.sql);
                    expect(decoded).to.contain(`savedChartUuid=${chart.uuid}`);
                });
        });

        it('runs the destination query (200 on metric-query + calculate-total) thanks to the saved-version exemption', () => {
            cy.intercept(
                'POST',
                `**/api/v2/projects/${SEED_PROJECT.project_uuid}/query/metric-query`,
            ).as('metricQuery');
            cy.intercept(
                'POST',
                `**/api/v1/projects/${SEED_PROJECT.project_uuid}/calculate-total`,
            ).as('calculateTotal');

            cy.visit(
                `/projects/${SEED_PROJECT.project_uuid}/saved/${chart.uuid}/view`,
            );
            cy.findByText('Explore from here', { timeout: 15000 }).click();

            cy.wait('@metricQuery')
                .its('response.statusCode')
                .should('eq', 200);
            cy.wait('@calculateTotal')
                .its('response.statusCode')
                .should('eq', 200);
        });

        it('still works for OLD share links that have full SQL but no savedChartUuid query param (backward compat)', () => {
            // Pre-PROD-7180 share links don't include savedChartUuid, but
            // their JSON payload carries chart.uuid — useSourceSavedChartUuid
            // falls back to it so the saved-version exemption still fires.
            cy.intercept(
                'POST',
                `**/api/v2/projects/${SEED_PROJECT.project_uuid}/query/metric-query`,
            ).as('metricQuery');

            cy.visit(buildOldStyleUrl(SEED_PROJECT.project_uuid, chart));

            cy.wait('@metricQuery').then((interception) => {
                expect(interception.response?.statusCode).to.eq(200);
                // Body must include savedChartUuid sourced from the JSON.uuid fallback
                expect(interception.request.body.savedChartUuid).to.eq(
                    chart.uuid,
                );
            });
        });
    });

    after(() => {
        if (chart?.uuid) {
            cy.login();
            cy.request({
                method: 'DELETE',
                url: `/api/v1/saved/${chart.uuid}`,
                failOnStatusCode: false,
            });
        }
        if (spaceUuid) {
            cy.request({
                method: 'DELETE',
                url: `/api/v1/projects/${SEED_PROJECT.project_uuid}/spaces/${spaceUuid}`,
                failOnStatusCode: false,
            });
        }
    });
});
