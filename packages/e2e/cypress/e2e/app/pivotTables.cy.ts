/* eslint-disable @typescript-eslint/no-explicit-any */
import { SEED_PROJECT } from '@lightdash/common';

describe('Pivot Tables', () => {
    beforeEach(() => {
        cy.login();
    });
    it('Can view shared pivot table from URL in explore', () => {
        // Navigate to the explore page
        cy.visit(
            `/projects/${SEED_PROJECT.project_uuid}/tables/orders?create_saved_chart_version=%7B%22tableName%22%3A%22orders%22%2C%22metricQuery%22%3A%7B%22exploreName%22%3A%22%22%2C%22dimensions%22%3A%5B%22orders_order_date_week%22%2C%22orders_status%22%2C%22orders_is_completed%22%5D%2C%22metrics%22%3A%5B%22orders_total_order_amount%22%5D%2C%22filters%22%3A%7B%7D%2C%22sorts%22%3A%5B%7B%22fieldId%22%3A%22orders_order_date_week%22%2C%22descending%22%3Atrue%7D%5D%2C%22limit%22%3A500%2C%22tableCalculations%22%3A%5B%5D%2C%22additionalMetrics%22%3A%5B%5D%2C%22metricOverrides%22%3A%7B%7D%7D%2C%22pivotConfig%22%3A%7B%22columns%22%3A%5B%22orders_status%22%5D%7D%2C%22tableConfig%22%3A%7B%22columnOrder%22%3A%5B%22orders_order_date_week%22%2C%22orders_status%22%2C%22orders_is_completed%22%2C%22orders_total_order_amount%22%5D%7D%2C%22chartConfig%22%3A%7B%22type%22%3A%22table%22%2C%22config%22%3A%7B%22showColumnCalculation%22%3Afalse%2C%22showRowCalculation%22%3Afalse%2C%22showTableNames%22%3Atrue%2C%22showResultsTotal%22%3Afalse%2C%22showSubtotals%22%3Afalse%2C%22columns%22%3A%7B%7D%2C%22hideRowNumbers%22%3Afalse%2C%22conditionalFormattings%22%3A%5B%5D%2C%22metricsAsRows%22%3Afalse%7D%7D%7D`,
        );

        // Create a pivot table
        cy.contains('placed');
        cy.contains('shipped');

        cy.contains('False');
        cy.contains('2018-04-02');
        cy.contains('$236.21');
    });
    it('Can create a pivot table chart on explore', () => {
        // Navigate to the explore page
        cy.visit(
            `/projects/${SEED_PROJECT.project_uuid}/tables/orders?create_saved_chart_version=%7B%22tableName%22%3A%22orders%22%2C%22metricQuery%22%3A%7B%22exploreName%22%3A%22%22%2C%22dimensions%22%3A%5B%22orders_order_date_week%22%2C%22orders_status%22%2C%22orders_is_completed%22%5D%2C%22metrics%22%3A%5B%22orders_total_order_amount%22%5D%2C%22filters%22%3A%7B%7D%2C%22sorts%22%3A%5B%7B%22fieldId%22%3A%22orders_order_date_week%22%2C%22descending%22%3Atrue%7D%5D%2C%22limit%22%3A500%2C%22tableCalculations%22%3A%5B%5D%2C%22additionalMetrics%22%3A%5B%5D%2C%22metricOverrides%22%3A%7B%7D%7D%2C%22tableConfig%22%3A%7B%22columnOrder%22%3A%5B%22orders_order_date_week%22%2C%22orders_status%22%2C%22orders_is_completed%22%2C%22orders_total_order_amount%22%5D%7D%2C%22chartConfig%22%3A%7B%22type%22%3A%22table%22%2C%22config%22%3A%7B%22showColumnCalculation%22%3Afalse%2C%22showRowCalculation%22%3Afalse%2C%22showTableNames%22%3Atrue%2C%22showResultsTotal%22%3Afalse%2C%22showSubtotals%22%3Afalse%2C%22columns%22%3A%7B%7D%2C%22hideRowNumbers%22%3Afalse%2C%22conditionalFormattings%22%3A%5B%5D%2C%22metricsAsRows%22%3Afalse%7D%7D%7D`,
        );

        cy.contains('Tables').should('be.visible'); // Ensure the sidebar has loaded before clicking configure below
        cy.contains('Configure').click();
        cy.contains('Drag dimensions into this area to pivot your table');

        const dragSelector =
            '[role="tabpanel"] [data-rfd-drag-handle-draggable-id="orders_is_completed"]';
        const dropSelector = '[data-rfd-droppable-id="COLUMNS"]';

        cy.dragAndDrop(dragSelector, dropSelector);

        cy.get('[data-testid="visualization"]').as('chartArea'); // Using an alias aviod querying the DOM for the same element multiple times

        cy.get('@chartArea').findByText('Loading chart').should('not.exist');
        cy.get('@chartArea').contains('Is completed'); // Check that the chart updated successfully with the pivot table(containing 'is completed' column)
    });

    it('I can save a pivot table chart and add it to a dashboard', () => {
        // Navigate to the explore page
        cy.visit(
            `/projects/${SEED_PROJECT.project_uuid}/tables/orders?create_saved_chart_version=%7B%22tableName%22%3A%22orders%22%2C%22metricQuery%22%3A%7B%22exploreName%22%3A%22%22%2C%22dimensions%22%3A%5B%22orders_order_date_week%22%2C%22orders_status%22%2C%22orders_is_completed%22%5D%2C%22metrics%22%3A%5B%22orders_total_order_amount%22%5D%2C%22filters%22%3A%7B%7D%2C%22sorts%22%3A%5B%7B%22fieldId%22%3A%22orders_order_date_week%22%2C%22descending%22%3Atrue%7D%5D%2C%22limit%22%3A500%2C%22tableCalculations%22%3A%5B%5D%2C%22additionalMetrics%22%3A%5B%5D%2C%22metricOverrides%22%3A%7B%7D%7D%2C%22pivotConfig%22%3A%7B%22columns%22%3A%5B%22orders_status%22%5D%7D%2C%22tableConfig%22%3A%7B%22columnOrder%22%3A%5B%22orders_order_date_week%22%2C%22orders_status%22%2C%22orders_is_completed%22%2C%22orders_total_order_amount%22%5D%7D%2C%22chartConfig%22%3A%7B%22type%22%3A%22table%22%2C%22config%22%3A%7B%22showColumnCalculation%22%3Afalse%2C%22showRowCalculation%22%3Afalse%2C%22showTableNames%22%3Atrue%2C%22showResultsTotal%22%3Afalse%2C%22showSubtotals%22%3Afalse%2C%22columns%22%3A%7B%7D%2C%22hideRowNumbers%22%3Afalse%2C%22conditionalFormattings%22%3A%5B%5D%2C%22metricsAsRows%22%3Afalse%7D%7D%7D`,
        );

        // Save a pivot table
        cy.contains('Save chart').click();
        cy.get('[data-testid="ChartCreateModal/NameInput"]').type(
            'My Pivot Table Chart',
        );
        cy.findByText('Save').click();
        cy.contains('Chart was saved');
        cy.contains('My Pivot Table Chart');

        // Add pivot table to a new dashboard
        cy.get('button:has(.tabler-icon-dots)').click();
        cy.contains('Add to dashboard').click();

        cy.contains('Add chart to dashboard');
        cy.contains('Create new dashboard').click();
        cy.get('#dashboard-name').type('My Pivot Table Dashboard');
        cy.get('button[type="submit"]').click({ force: true }); // Create dashboard
        cy.contains('Open dashboard').click();

        // Wait until dashboard is loaded
        cy.contains('Date Zoom');
        cy.contains('My Pivot Table Chart');
        cy.contains('placed');
        cy.contains('shipped');
        cy.contains('False');
        cy.contains('2018-04-02');
        cy.contains('$236.21');
    });
});
