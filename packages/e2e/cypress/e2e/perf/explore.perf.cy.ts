import { AnyType, SEED_PROJECT } from '@lightdash/common';

const RUN_ID = Cypress.env('RUN_ID') || `${Date.now()}`;

/**
 * This test is used to measure the interaction performance of the explore page.
 * It measures time between interactins and renders for a few different critical interactions,
 * then writes out an artifact showing the durations of interactions we are trying to improve
 * and profiler data for the whole spec.
 *
 * NOTE: data is not mocked, but measurements happen from interactionts to the resulting renders.
 * We could improve this by mocking data, but this will give us a baseline for FE interactions.
 *
 */

/* This is a list of all the flow ids that we are measuring.
 * If you add a new flow, you need to add the id to this list.
 * This is just a simple guard to make sure we are deliberate about
 * adding and changing flows.
 */
const flowIds = [
    'field-select:address',
    'run-query-starts-loading',
    'open-chart',
    'add-filter',
    'search-fields',
    'search-field-select',
] as const;

type FlowId = typeof flowIds[number];

function validateFlowId(id: string): asserts id is FlowId {
    if (!flowIds.includes(id as FlowId)) {
        throw new Error(
            `Invalid flow ID: ${id}. Must be one of: ${flowIds.join(', ')}`,
        );
    }
}

describe('Explore perf', () => {
    beforeEach(() => {
        cy.login();
    });
    it('load explore', () => {
        const FLOWS: string[] = [];
        let flowId = '';

        cy.visit(`/projects/${SEED_PROJECT.project_uuid}/tables`);

        // Enable profiling capture and clear any existing data after navigation
        cy.window().then((w) => {
            // eslint-disable-next-line no-underscore-dangle, no-param-reassign
            (w as AnyType).__captureProfiling = true;
            // eslint-disable-next-line no-underscore-dangle, no-param-reassign
            (w as AnyType).__profiling = [];
        });

        cy.findByTestId('page-spinner').should('not.exist');

        cy.findByText('Generated a').click();
        cy.findByText('Address').should('exist');

        cy.log('Open some joins to slow things down');
        cy.findByText('Join 1').click();
        cy.findByText('Join 2').click();
        cy.findByText('Join 3').click();
        cy.findByText('Join 4').click();
        cy.findByText('Join 5').click();
        cy.findByText('Join 6').click();
        cy.findByText('Join 7').click();
        cy.findByText('Join 8').click();
        cy.findByText('Join 9').click();
        cy.findByText('Join 10').click();

        cy.log('Select address and measure table header render');
        flowId = 'field-select:address';
        validateFlowId(flowId);
        FLOWS.push(flowId);
        cy.flowBegin(flowId, 'clickField');
        cy.contains('Address').first().click();
        cy.flowEndWhenVisible(
            flowId,
            'tableHeaderRender',
            '[data-testid="table-header"]:has(th:contains("Address"))',
        );

        // Add another field for the chart, but don't measure
        cy.contains('Name').first().click();

        cy.log(
            'Click the Run Query button and measure time until loading state renders',
        );
        flowId = 'run-query-starts-loading';
        validateFlowId(flowId);
        FLOWS.push(flowId);
        cy.flowBegin(flowId, 'run-query-click');
        cy.get('[data-testid="RefreshButton/RunQueryButton"]').first().click();

        cy.flowEndWhenVisible(
            flowId,
            'loaderRender',
            '[data-testid="results-table-loading"]',
        );

        // Wait for data to load
        cy.findByTestId('table-header').should('exist');
        cy.flowEndWhenVisible(flowId, 'chartRender', '.echarts-for-react');

        cy.log('Add filter and measure time to show the whole fitler rule');
        flowId = 'add-filter';
        validateFlowId(flowId);
        FLOWS.push(flowId);
        cy.flowBegin(flowId, 'clickOpenFilters');
        cy.findByTestId('Filters-card-expand').click();
        cy.flowStepWhenVisible(
            flowId,
            'addFilterButtonRender',
            '[data-testid="FiltersForm/add-filter-button"]',
        );
        cy.contains('Add filter').click();
        cy.findByPlaceholderText('Search field...').type(
            'Currency{downArrow}{enter}',
        );
        cy.flowEndWhenVisible(
            flowId,
            'filterRuleRender',
            '[data-testid="FilterRuleForm/filter-rule"]',
        );

        cy.log('Search for fields');
        flowId = 'search-fields';
        validateFlowId(flowId);
        FLOWS.push(flowId);
        cy.flowBegin(flowId, 'searchFields');
        cy.findByTestId('ExploreTree/SearchInput').type('Num');
        cy.flowStepWhenVisible(
            flowId,
            'fieldsSearchLoaderRender',
            '[data-testid="ExploreTree/SearchInput-Loader"]',
        );
        cy.flowEndWhenVisible(
            flowId,
            'fieldsSearchResultsRender',
            '[data-testid="tree-single-node-Alphanumeric"]',
        );

        cy.log('Select field while search is active');
        flowId = 'search-field-select';
        validateFlowId(flowId);
        FLOWS.push(flowId);
        cy.flowBegin(flowId, 'selectField');
        cy.contains('Alphanumeric').first().click();
        cy.flowEndWhenVisible(
            flowId,
            'tableHeaderRender',
            '[data-testid="table-header"]:has(th:contains("Alphanumeric"))',
        );

        // Collect all performance data and write artifact
        cy.collectAndWritePerfArtifact({
            flows: FLOWS,
            runId: RUN_ID,
            filenamePrefix: 'explore-perf',
        });
    });
});
