import {
    FeatureFlags,
    SEED_PROJECT,
    type ApiChartSummaryListResponse,
} from '@lightdash/common';

describe('Dashboard chart version history', () => {
    it('keeps the freshness notice inset while a long version list scrolls', () => {
        cy.login();
        cy.viewport(1280, 720);
        cy.intercept(
            'GET',
            `/api/v2/feature-flag/${FeatureFlags.InDashboardChartEditor}`,
            { status: 'ok', results: { enabled: true } },
        );
        cy.intercept('GET', '/api/v1/saved/*/history', (request) => {
            request.continue((response) => {
                const currentVersion = response.body.results.history[0];
                response.body.results.history = Array.from(
                    { length: 50 },
                    (_, index) => ({
                        ...currentVersion,
                        versionUuid:
                            index === 0
                                ? currentVersion.versionUuid
                                : `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
                    }),
                );
            });
        });

        cy.visit(`/projects/${SEED_PROJECT.project_uuid}/dashboards`);
        cy.contains('a', 'Jaffle dashboard').click();
        cy.location('pathname')
            .should('match', /\/dashboards\/[^/]+/)
            .then((dashboardPath) => {
                cy.request<ApiChartSummaryListResponse>(
                    `/api/v1/projects/${SEED_PROJECT.project_uuid}/charts`,
                ).then(({ body }) => {
                    const chart = body.results.find(
                        ({ name }) =>
                            name ===
                            'How much revenue do we have per payment method?',
                    );
                    expect(chart, 'seeded revenue chart').to.not.eq(undefined);
                    cy.visit(`${dashboardPath}?editChart=${chart!.uuid}`);
                });
            });
        cy.findByRole('button', { name: 'Chart actions' }).click();
        cy.findByRole('menuitem', { name: 'Version history' }).click();

        const assertFreshnessInset = () => {
            cy.findByRole('alert', { name: 'Data freshness' }).should(
                ($notice) => {
                    const notice = $notice[0];
                    const sidebar = notice.parentElement!;
                    const noticeBounds = notice.getBoundingClientRect();
                    const sidebarBounds = sidebar.getBoundingClientRect();
                    expect(noticeBounds.bottom).to.be.at.most(
                        sidebarBounds.bottom - 15,
                    );
                    expect(noticeBounds.top).to.be.at.least(sidebarBounds.top);
                },
            );
        };

        assertFreshnessInset();
        cy.findByRole('group', { name: 'Chart versions' }).should(($list) => {
            expect($list[0].scrollHeight).to.be.greaterThan(
                $list[0].clientHeight,
            );
        });
        cy.findByRole('group', { name: 'Chart versions' }).scrollTo('bottom');
        assertFreshnessInset();
    });
});
