import { SEED_PROJECT } from '@lightdash/common';

// Reusable helper function to handle download flow with new endpoint structure
const waitForDownloadToComplete = (
    projectUuid: string,
    options: {
        scheduleAlias?: string;
        pollAlias?: string;
        timeout?: number;
        maxPolls?: number;
        pollInterval?: number;
    } = {},
) => {
    const {
        scheduleAlias = 'apiScheduleDownload',
        pollAlias = 'apiPollJob',
        timeout = 10000,
        maxPolls = 10,
        pollInterval = 1000,
    } = options;

    // Intercept the schedule download endpoint
    const scheduleUrl = `/api/v2/projects/${projectUuid}/query/*/schedule-download`;
    cy.intercept({
        method: 'POST',
        url: scheduleUrl,
    }).as(scheduleAlias);

    // Intercept the poll job status endpoint
    const pollUrl = `/api/v1/schedulers/job/*/status`;
    cy.intercept({
        method: 'GET',
        url: pollUrl,
    }).as(pollAlias);

    // Click export results button
    cy.get('[data-testid=chart-export-results-button]').click();

    // Wait for schedule request
    cy.wait(`@${scheduleAlias}`, { timeout }).then((interception) => {
        // Validate schedule response
        expect(interception?.response?.statusCode).to.eq(200);
        expect(interception?.response?.body.results).to.have.property('jobId');

        const jobId = interception.response?.body.results.jobId;
        cy.log(`Download job scheduled with ID: ${jobId}`);
    });

    // Poll for job completion with retry logic
    const pollForJob = (attempt = 1): void => {
        if (attempt > maxPolls) {
            throw new Error(`Job did not complete after ${maxPolls} attempts`);
        }

        cy.wait(`@${pollAlias}`, { timeout: pollInterval * 2 }).then(
            (interception) => {
                expect(interception?.response?.statusCode).to.eq(200);
                const jobStatus = interception?.response?.body.results;

                cy.log(
                    `Poll attempt ${attempt}: Job status = ${jobStatus?.status}`,
                );

                // Check if job is completed
                if (jobStatus?.status === 'completed') {
                    expect(jobStatus.details).to.have.property('fileUrl');
                    cy.log(
                        `Job completed with file URL: ${jobStatus.details.fileUrl}`,
                    );
                    return; // Done!
                }

                // If still running, poll again after a delay
                if (
                    jobStatus?.status === 'scheduled' ||
                    jobStatus?.status === 'started'
                ) {
                    cy.wait(pollInterval);
                    pollForJob(attempt + 1);
                    return;
                }

                // If error or unknown status, fail
                if (jobStatus?.status === 'error') {
                    throw new Error(
                        `Job failed with error: ${
                            jobStatus?.details?.error || 'Unknown error'
                        }`,
                    );
                }

                throw new Error(
                    `Job has unexpected status: ${jobStatus?.status}`,
                );
            },
        );
    };

    // Start polling
    pollForJob();
};

// todo: remove
describe.skip('Download CSV on Dashboards', () => {
    beforeEach(() => {
        cy.login();

        cy.on('url:changed', (newUrl) => {
            if (newUrl.includes('.csv')) {
                window.location.href = '/';
            }
        });

        cy.visit(`/projects/${SEED_PROJECT.project_uuid}/dashboards`, {
            timeout: 60000,
        });
    });

    it('Should download a CSV from dashboard', () => {
        // wait for the dashboard to load
        cy.findByText('Loading dashboards').should('not.exist');

        cy.contains('a', 'Jaffle dashboard').click();

        cy.findByTestId('page-spinner').should('not.exist');

        cy.findAllByText('No chart available').should('have.length', 0);
        cy.findAllByText('No data available').should('have.length', 0);

        cy.get('thead th').should('have.length', 6); // Table chart
        cy.contains('Days since').trigger('mouseenter');

        cy.findByTestId('tile-icon-more').click();
        cy.get('button').contains('Download data').click();

        cy.get('[data-testid=chart-export-results-button]').should(
            'be.visible',
        );

        // Wait for download to complete (schedule and poll)
        waitForDownloadToComplete(SEED_PROJECT.project_uuid, {
            scheduleAlias: 'dashboardCsvDownload',
            pollAlias: 'dashboardCsvPoll',
        });
    });
});

describe('Download CSV on Explore', () => {
    beforeEach(() => {
        cy.login();

        cy.on('url:changed', (newUrl) => {
            if (newUrl.includes('.csv')) {
                window.location.href = '/';
            }
        });
        cy.visit(`/projects/${SEED_PROJECT.project_uuid}/tables`, {
            timeout: 60000,
        });

        cy.findByTestId('page-spinner').should('not.exist');
    });

    it('Should download CSV from results on Explore', () => {
        // choose table and select fields
        cy.findByText('Orders').click();
        cy.findByText('Order date').should('be.visible'); // Wait for Orders table columns to appear
        cy.scrollTreeToItem('Order Customer');
        cy.findByText('Order Customer').click();
        cy.scrollTreeToItem('First name');
        cy.findByText('First name').click();
        cy.scrollTreeToItem('Unique order count');
        cy.findByText('Unique order count').click();

        // run query
        cy.get('button').contains('Run query').click();

        // wait for the chart to finish loading
        cy.findByText('Loading chart').should('not.exist');
        cy.findByText('Loading results').should('not.exist');
        cy.get('body').then(($body) => {
            if ($body.find('[data-testid=export-csv-button]').length > 1) {
                // close chart section
                cy.findByTestId('Chart-card-expand').click();
            }
        });
        // Export results
        cy.get('[data-testid=export-csv-button]').click();

        // Wait for download to complete (schedule and poll)
        waitForDownloadToComplete(SEED_PROJECT.project_uuid, {
            scheduleAlias: 'exploreCsvDownload',
            pollAlias: 'exploreCsvPoll',
        });
    });

    // todo: remove
    it.skip('Should download CSV from table chart on Explore', () => {
        cy.findByTestId('page-spinner').should('not.exist');

        // choose table and select fields
        cy.findByText('Orders').click();
        cy.findByText('Order date').should('be.visible'); // Wait for Orders table columns to appear
        cy.scrollTreeToItem('Order Customer');
        cy.findByText('Order Customer').click();
        cy.scrollTreeToItem('First name');
        cy.findByText('First name').click();
        cy.scrollTreeToItem('Unique order count');
        cy.findByText('Unique order count').click();

        // run query
        cy.get('button').contains('Run query').click();

        // wait for chart to be expanded and configure button to be available, then change chart type to Table
        cy.get('body').then(($body) => {
            if ($body.find(':contains("Configure")').length === 0) {
                // open chart section if closed
                cy.get('[data-testid=Chart-card-expand]').click();
            }
        });
        cy.findByText('Configure').click();
        cy.get('button').contains('Bar chart').click();
        cy.get('[role="menuitem"]').contains('Table').click();
        cy.get('[data-testid=export-csv-button]').first().click();

        // Wait for download to complete (schedule and poll)
        waitForDownloadToComplete(SEED_PROJECT.project_uuid, {
            scheduleAlias: 'exploreTableCsvDownload',
            pollAlias: 'exploreTableCsvPoll',
        });
    });
});
