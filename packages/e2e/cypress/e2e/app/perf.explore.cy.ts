import { AnyType, SEED_PROJECT } from '@lightdash/common';

type Artifact = {
    meta: {
        runId: string;
        build: string;
        url: string;
        ts: number;
    };
    webVitals: AnyType[];
    profiler: AnyType[];
    userTiming: {
        measures: { name: string; duration: number; startTime: number }[];
        marks: { name: string; startTime: number }[];
    };
    flows: {
        [flowId: string]: {
            total: { duration: number; startTime: number } | null;
            steps: { name: string; duration: number; startTime: number }[];
        };
    };
    nav: {
        durationMs: number;
        transferSize?: number;
    };
};

const RUN_ID = Cypress.env('RUN_ID') || `${Date.now()}`;

describe('Explore perf', () => {
    beforeEach(() => {
        cy.login();
    });
    it('load explore', () => {
        const FLOWS: string[] = [];

        cy.visit(`/projects/${SEED_PROJECT.project_uuid}/tables`);
        cy.findByTestId('page-spinner').should('not.exist');

        cy.findByText('Orders').click();
        cy.findByText('Dimensions').should('exist');
        cy.findByText('Customers').click();

        let flowId = 'field-select:unique_order_count';
        FLOWS.push(flowId);
        // Start flow timing before first field click
        cy.flowBegin(flowId, 'clickField');
        cy.findByText('Unique order count').click();
        cy.flowEndWhenVisible(
            flowId,
            'tableHeaderRender',
            '[data-testid="table-header"]:has(th:contains("Unique order count"))',
        );

        flowId = 'field-select:first_name';
        FLOWS.push(flowId);
        cy.flowBegin(flowId, 'clickField');
        cy.findByText('First name').click();
        cy.flowEndWhenVisible(
            flowId,
            'finalResults',
            '[data-testid="table-header"]:has(th:contains("First name"))',
        );

        flowId = 'add-filter';
        FLOWS.push(flowId);
        cy.flowBegin(flowId, 'open_filters');
        cy.findByTestId('Filters-card-expand').click();
        cy.flowStepWhenVisible(
            flowId,
            'add_filter',
            '[data-testid="FiltersForm/add-filter-button"]',
        );
        cy.contains('Add filter').click();
        cy.findByRole('option', { name: /^Currency$/ }).click();
        cy.flowStepWhenVisible(
            flowId,
            'add_filter',
            '[data-testid="FiltersForm/add-filter-button"]',
        );
        cy.flowEndWhenVisible(
            flowId,
            'finalResults',
            '[data-testid="FilterRuleForm/filter-rule"]',
        );

        cy.window().then((win) => {
            // eslint-disable-next-line @typescript-eslint/dot-notation
            const build = (win as AnyType)['__BUILD_SHA'] || 'dev';
            // eslint-disable-next-line @typescript-eslint/dot-notation
            const webVitals = (win as AnyType)['__webVitals'] || [];
            // eslint-disable-next-line @typescript-eslint/dot-notation
            const profiler = (win as AnyType)['__profiling'] || [];

            const measures = win.performance.getEntriesByType(
                'measure',
            ) as PerformanceMeasure[];
            const marks = win.performance.getEntriesByType(
                'mark',
            ) as PerformanceMark[];

            // Basic nav stats (from nav timing v2)
            const navEntries = win.performance.getEntriesByType(
                'navigation',
            ) as PerformanceNavigationTiming[];
            const nav = navEntries[0]
                ? {
                      durationMs: navEntries[0].duration,
                      transferSize: (navEntries[0] as AnyType).transferSize,
                  }
                : { durationMs: NaN };

            // Collect flow timing data for all flows
            cy.flowCollectMultiple(FLOWS).then((allFlowData) => {
                const flows: {
                    [flowId: string]: {
                        total: { duration: number; startTime: number } | null;
                        steps: {
                            name: string;
                            duration: number;
                            startTime: number;
                        }[];
                    };
                } = {};

                // Process each flow's data
                Object.entries(allFlowData).forEach(([id, flowData]) => {
                    flows[id] = {
                        total: flowData.total[0]
                            ? {
                                  duration: flowData.total[0].duration,
                                  startTime: flowData.total[0].startTime,
                              }
                            : null,
                        steps: flowData.steps.map((s) => ({
                            name: s.name,
                            duration: s.duration,
                            startTime: s.startTime,
                        })),
                    };
                });

                const artifact: Artifact = {
                    meta: {
                        runId: RUN_ID,
                        build,
                        url: win.location.pathname + win.location.search,
                        ts: win.performance.now(),
                    },
                    webVitals,
                    profiler,
                    userTiming: {
                        measures: measures.map((m) => ({
                            name: m.name,
                            duration: m.duration,
                            startTime: m.startTime,
                        })),
                        marks: marks.map((m) => ({
                            name: m.name,
                            startTime: m.startTime,
                        })),
                    },
                    flows,
                    nav,
                };

                const commitDurations = artifact.profiler.map(
                    (p: AnyType) => p.actualDuration,
                );
                if (commitDurations.length) {
                    const median = commitDurations.sort(
                        (a: number, b: number) => a - b,
                    )[Math.floor(commitDurations.length / 2)];
                    expect(median, 'median actualDuration').to.be.lessThan(80);
                }

                // Persist JSON
                const filename = `perf-${artifact.meta.build}-${artifact.meta.runId}.json`;
                cy.task('writeArtifact', { filename, data: artifact });
            });
        });
    });
});
