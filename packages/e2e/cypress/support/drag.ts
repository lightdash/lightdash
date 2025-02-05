/* eslint-disable @typescript-eslint/no-explicit-any */

/** This function didn't work as expected,
 * something might be wrong with the dispatch events */
const drag = (dragSelector: string, dropSelector: string) => {
    // Based on this answer: https://stackoverflow.com/a/55436989/3694288

    cy.get(dragSelector)
        .should('exist')
        .get(dropSelector)
        .should('exist')
        .then(() => {
            const draggable = Cypress.$(dragSelector)[0]; // Pick up this
            const droppable = Cypress.$(dropSelector)[0]; // Drop over this

            const coords = droppable.getBoundingClientRect();
            draggable.dispatchEvent(<any>new MouseEvent('mousedown'));
            draggable.dispatchEvent(
                <any>new MouseEvent('mousemove', { clientX: 10, clientY: 0 }),
            );
            draggable.dispatchEvent(
                <any>new MouseEvent('mousemove', {
                    clientX: coords.left + 10,
                    clientY: coords.top + 10, // A few extra pixels to get the ordering right
                }),
            );
            draggable.dispatchEvent(new MouseEvent('mouseup'));

            return cy.get(dropSelector);
        });
};

export default drag;
