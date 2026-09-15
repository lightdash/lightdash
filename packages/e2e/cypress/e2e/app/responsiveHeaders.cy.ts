import {
    SEED_PROJECT,
    type ApiChartSummaryListResponse,
    type ApiGetDashboardsResponse,
} from '@lightdash/common';

const assertHeaderFits = () => {
    cy.get('[data-testid="page-header"]').should(($header) => {
        const header = $header[0];
        const bounds = header.getBoundingClientRect();
        const win = header.ownerDocument.defaultView!;
        expect(bounds.left).to.be.at.least(0);
        expect(bounds.right).to.be.at.most(win.innerWidth);
        expect(bounds.top).to.be.at.least(0);
        expect(bounds.bottom).to.be.at.most(win.innerHeight);
        const controls = [...header.querySelectorAll('button')]
            .filter((button) => Cypress.dom.isVisible(button))
            .map((button) => button.getBoundingClientRect());
        expect(controls.length).to.be.greaterThan(0);
        controls.forEach((control, index) => {
            expect(control.left).to.be.at.least(bounds.left);
            expect(control.right).to.be.at.most(bounds.right);
            expect(control.top).to.be.at.least(bounds.top);
            expect(control.bottom).to.be.at.most(bounds.bottom);
            expect(control.height).to.be.at.most(48);
            controls.slice(index + 1).forEach((other) => {
                const overlapWidth =
                    Math.min(control.right, other.right) -
                    Math.max(control.left, other.left);
                const overlapHeight =
                    Math.min(control.bottom, other.bottom) -
                    Math.max(control.top, other.top);
                expect(
                    overlapWidth > 1 && overlapHeight > 1,
                    'header controls must not overlap',
                ).to.eq(false);
            });
        });
    });
};

describe('Responsive content headers', () => {
    beforeEach(() => cy.login());

    it('keeps chart actions reachable and the viewer URL unchanged through resize', () => {
        cy.request<ApiChartSummaryListResponse>(
            `api/v1/projects/${SEED_PROJECT.project_uuid}/charts`,
        ).then(({ body }) => {
            const chart = body.results.find(
                ({ name }) => name === "What's our total revenue to date?",
            );
            expect(chart, 'seeded chart').not.to.eq(undefined);
            cy.visit(
                `/projects/${SEED_PROJECT.project_uuid}/saved/${chart!.uuid}`,
            );
        });
        cy.findByRole('button', { name: 'Chart actions' }).should('be.visible');
        cy.location('pathname').then((viewerPath) => {
            [1280, 744, 640, 639, 390, 1280].forEach((width) => {
                cy.viewport(width, 800);
                cy.scrollTo('top', { ensureScrollable: false });
                assertHeaderFits();
                cy.location('pathname').should('eq', viewerPath);
                cy.findByRole('button', { name: 'Chart actions' }).click();
                cy.findByRole('menuitem', { name: 'Version history' }).should(
                    'be.visible',
                );
                if (width < 640) {
                    cy.findByRole('menuitem', { name: 'Edit chart' }).should(
                        'be.visible',
                    );
                } else {
                    cy.findByRole('button', { name: 'Edit chart' }).should(
                        'be.visible',
                    );
                }
                cy.get('body').type('{esc}');
            });
        });
    });

    it('keeps the dashboard menu open and preserves an unsaved details draft through resize', () => {
        cy.viewport(1280, 800);
        cy.request<ApiGetDashboardsResponse>(
            `api/v1/projects/${SEED_PROJECT.project_uuid}/dashboards`,
        ).then(({ body }) => {
            const dashboard = body.results.find(
                ({ name }) => name === 'Jaffle dashboard',
            );
            expect(dashboard, 'seeded dashboard').not.to.eq(undefined);
            cy.visit(
                `/projects/${SEED_PROJECT.project_uuid}/dashboards/${dashboard!.uuid}/view`,
            );
        });
        cy.findByRole('button', { name: 'Dashboard actions' }).click();
        cy.location('pathname').then((viewerPath) => {
            [744, 640, 639, 390, 1280].forEach((width) => {
                cy.viewport(width, 800);
                cy.scrollTo('top', { ensureScrollable: false });
                assertHeaderFits();
                cy.location('pathname').should('eq', viewerPath);
                cy.findByRole('menu', { name: 'Dashboard actions' }).should(
                    'be.visible',
                );
                cy.findByRole('menuitem', { name: 'Edit details' }).should(
                    'be.visible',
                );
                cy.findByRole(width < 640 ? 'menuitem' : 'button', {
                    name: 'Edit dashboard',
                }).should('be.visible');
            });
        });
        cy.findByRole('menuitem', { name: 'Edit details' }).click({
            scrollBehavior: false,
        });
        cy.findByRole('textbox', { name: /^Name/ })
            .clear()
            .type('Unsaved responsive draft')
            .then(($input) => {
                [744, 390, 1280].forEach((width) => {
                    cy.viewport(width, 800);
                    cy.findByRole('textbox', { name: /^Name/ })
                        .should('have.value', 'Unsaved responsive draft')
                        .should(($current) => {
                            expect(
                                $current[0],
                                'same input survives resize',
                            ).to.eq($input[0]);
                        });
                    cy.findByRole('dialog', {
                        name: 'Update Dashboard',
                    }).within(() => {
                        cy.findByRole('button', { name: 'Save' }).should(
                            ($button) => {
                                const bounds =
                                    $button[0].getBoundingClientRect();
                                const win =
                                    $button[0].ownerDocument.defaultView!;
                                expect(bounds.bottom).to.be.at.most(
                                    win.innerHeight,
                                );
                                expect(bounds.top).to.be.at.least(0);
                                expect(bounds.left).to.be.at.least(0);
                                expect(bounds.right).to.be.at.most(
                                    win.innerWidth,
                                );
                            },
                        );
                    });
                });
            });
        cy.findByRole('button', { name: 'Cancel' }).click();
        cy.findByRole('dialog', { name: 'Update Dashboard' }).should(
            'not.exist',
        );
        cy.findByRole('heading', { name: 'Jaffle dashboard' }).should(
            'be.visible',
        );
    });
});
