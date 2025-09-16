// cypress/e2e/perf.explore.cy.ts
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
        cy.visit(`/projects/${SEED_PROJECT.project_uuid}/tables`);
        cy.findByTestId('page-spinner').should('not.exist');

        cy.findByText('Orders').click();
        cy.findByText('Dimensions').should('exist');
        cy.findByText('Customers').click();

        cy.findByText('Unique order count').click();
        cy.findByText('First name').click();

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
