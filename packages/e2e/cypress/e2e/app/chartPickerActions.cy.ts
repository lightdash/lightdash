import { SEED_PROJECT } from '@lightdash/common';

describe('Chart picker actions', () => {
    let pointer: { x: number; y: number } | undefined;

    afterEach(() => {
        if (pointer) {
            const position = pointer;
            pointer = undefined;
            cy.then(() =>
                Cypress.automation('remote:debugger:protocol', {
                    command: 'Input.dispatchMouseEvent',
                    params: {
                        type: 'mouseReleased',
                        button: 'left',
                        clickCount: 1,
                        ...position,
                    },
                }),
            );
        }
    });

    it('keeps the configure cog centered while the mouse is pressed', function keepsCogCentered() {
        if (!Cypress.isBrowser({ family: 'chromium' })) this.skip();

        cy.login();
        cy.visit(`/projects/${SEED_PROJECT.project_uuid}/tables/orders`);
        cy.findByTestId('page-spinner').should('not.exist');
        cy.scrollTreeToItem('Unique order count');
        cy.findByText('Unique order count').click();
        cy.get('table').should('contain.text', 'Unique order count');
        cy.findByRole('button', { name: 'Configure', exact: true }).click();
        cy.findByRole('button', { name: 'Change', exact: true }).click();

        cy.findByRole('button', { name: 'Configure Bar chart', exact: true })
            .focus()
            .then(($button) => {
                const button = $button[0];
                const frame = button.ownerDocument.defaultView!
                    .frameElement as HTMLIFrameElement;
                const frameBounds = frame.getBoundingClientRect();
                const bounds = button.getBoundingClientRect();
                pointer = {
                    x:
                        frameBounds.left +
                        (bounds.left + bounds.width / 2) *
                            (frameBounds.width / frame.offsetWidth),
                    y:
                        frameBounds.top +
                        (bounds.top + bounds.height / 2) *
                            (frameBounds.height / frame.offsetHeight),
                };

                // Synthetic mousedown events do not activate CSS :active.
                return Cypress.automation('remote:debugger:protocol', {
                    command: 'Input.dispatchMouseEvent',
                    params: {
                        type: 'mousePressed',
                        button: 'left',
                        buttons: 1,
                        clickCount: 1,
                        ...pointer,
                    },
                });
            });

        cy.findByRole('button', {
            name: 'Configure Bar chart',
            exact: true,
        }).should(($button) => {
            const button = $button[0];
            expect(button.matches(':active'), 'native pressed state').to.eq(
                true,
            );
            const bounds = button.getBoundingClientRect();
            const tile = button.parentElement!.getBoundingClientRect();
            expect(
                Math.abs(
                    bounds.left + bounds.width / 2 - tile.left - tile.width / 2,
                ),
                'horizontal offset from the tile center',
            ).to.be.lessThan(1);
            const label = button.parentElement!.querySelector('p')!;
            expect(bounds.bottom, 'cog stays above the title').to.be.lessThan(
                label.getBoundingClientRect().top,
            );
            expect(
                getComputedStyle(label).opacity,
                'title remains visible',
            ).to.eq('1');
        });
    });
});
