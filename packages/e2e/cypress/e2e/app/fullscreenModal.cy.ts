import {
    SEED_PROJECT,
    type ApiChartSummaryListResponse,
} from '@lightdash/common';

const CHART_NAME = "What's our total revenue to date?";

const openUnderlyingDataModal = (viewportHeight: number) => {
    cy.viewport(1280, viewportHeight);
    cy.request<ApiChartSummaryListResponse>(
        `api/v1/projects/${SEED_PROJECT.project_uuid}/charts`,
    ).then((chartsResponse) => {
        expect(chartsResponse.status).to.eq(200);
        const chart = chartsResponse.body.results.find(
            ({ name }) => name === CHART_NAME,
        );
        expect(chart, `seeded chart "${CHART_NAME}"`).to.not.eq(undefined);

        cy.visit(`/projects/${SEED_PROJECT.project_uuid}/saved/${chart!.uuid}`);
    });

    cy.contains('Results').click();
    cy.findAllByText('Loading chart').should('have.length', 0);
    cy.get('[data-testid="big-number-value"]').click();
    cy.findByRole('menuitem', { name: 'View underlying data' }).click();
};

describe('Fullscreen modal', () => {
    beforeEach(() => {
        cy.login();
    });

    [720, 1234].forEach((viewportHeight) => {
        it(`keeps underlying data below the navbar at ${viewportHeight}px`, () => {
            openUnderlyingDataModal(viewportHeight);

            cy.get('section[role="dialog"]')
                .should('be.visible')
                .should(($modal) => {
                    const modalElement = $modal[0];
                    const modal = modalElement.getBoundingClientRect();
                    const win = modalElement.ownerDocument.defaultView!;
                    const navbar = win.document
                        .querySelector('#navbar-header')!
                        .getBoundingClientRect();

                    expect(modal.top).to.equal(navbar.bottom + 24);
                    expect(modal.bottom).to.equal(win.innerHeight - 24);
                    expect(modal.left).to.equal(24);
                    expect(modal.right).to.equal(win.innerWidth - 24);
                });

            cy.findByRole('button', { name: 'Close' }).click();
            cy.get('section[role="dialog"]').should('not.exist');
        });
    });
});
