import { CreateEmbedJwt, SEED_PROJECT, UpdateEmbed } from '@lightdash/common';

const EMBED_API_PREFIX = `/api/v1/embed/${SEED_PROJECT.project_uuid}`;

export const getEmbedConfig = (
    requestOptions?: Partial<Cypress.RequestOptions>,
) =>
    cy.request({
        url: `${EMBED_API_PREFIX}/config`,
        method: 'GET',
        ...requestOptions,
    });

export const updateEmbedConfig = (
    body: UpdateEmbed,
    requestOptions?: Partial<Cypress.RequestOptions>,
) =>
    cy.request({
        url: `${EMBED_API_PREFIX}/config`,
        headers: { 'Content-type': 'application/json' },
        method: 'PATCH',
        body,
        ...requestOptions,
    });

export const getEmbedUrl = (
    body: CreateEmbedJwt,
    requestOptions?: Partial<Cypress.RequestOptions>,
) =>
    cy.request({
        url: `${EMBED_API_PREFIX}/get-embed-url`,
        headers: { 'Content-type': 'application/json' },
        method: 'POST',
        body,
        ...requestOptions,
    });

export const updateEmbedConfigDashboards = (
    dashboardUuids: string[],
    requestOptions?: Partial<Cypress.RequestOptions>,
) =>
    cy.request({
        url: `${EMBED_API_PREFIX}/config/dashboards`,
        headers: { 'Content-type': 'application/json' },
        method: 'PATCH',
        body: {
            dashboardUuids,
            chartUuids: [],
            allowAllDashboards: false,
            allowAllCharts: false,
        },
        ...requestOptions,
    });

/**
 * Waits for embed config to contain the expected chart UUIDs.
 * Retries up to maxAttempts times with a delay between each attempt.
 */
export const waitForEmbedConfigWithCharts = (
    expectedChartUuids: string[],
    maxAttempts = 20,
    delayMs = 1000,
): Cypress.Chainable<Cypress.Response<unknown>> => {
    const checkConfig = (
        attempt: number,
    ): Cypress.Chainable<Cypress.Response<unknown>> =>
        getEmbedConfig().then((resp) => {
            const config = resp.body?.results;
            cy.log(
                `[waitForEmbedConfigWithCharts] Attempt ${attempt}/${maxAttempts}: ` +
                    `status=${resp.status}, chartUuids=${JSON.stringify(config?.chartUuids || [])}`,
            );

            if (resp.status !== 200) {
                if (attempt >= maxAttempts) {
                    throw new Error(
                        `Failed to get embed config after ${maxAttempts} attempts`,
                    );
                }
                return cy.wait(delayMs).then(() => checkConfig(attempt + 1));
            }

            const hasAllCharts = expectedChartUuids.every((uuid) =>
                config.chartUuids?.includes(uuid),
            );

            if (hasAllCharts) {
                cy.log(
                    `[waitForEmbedConfigWithCharts] Success on attempt ${attempt}`,
                );
                return cy.wrap(resp);
            }

            if (attempt >= maxAttempts) {
                throw new Error(
                    `Embed config did not contain expected charts after ${maxAttempts} attempts. ` +
                        `Expected: ${expectedChartUuids.join(', ')}, ` +
                        `Got: ${config.chartUuids?.join(', ') || 'empty'}`,
                );
            }

            return cy.wait(delayMs).then(() => checkConfig(attempt + 1));
        });

    return checkConfig(1);
};

/**
 * Waits for embed config to contain the expected dashboard UUIDs.
 * Retries up to maxAttempts times with a delay between each attempt.
 */
export const waitForEmbedConfigWithDashboards = (
    expectedDashboardUuids: string[],
    maxAttempts = 10,
    delayMs = 500,
): Cypress.Chainable<Cypress.Response<unknown>> => {
    const checkConfig = (
        attempt: number,
    ): Cypress.Chainable<Cypress.Response<unknown>> =>
        getEmbedConfig().then((resp) => {
            if (resp.status !== 200) {
                if (attempt >= maxAttempts) {
                    throw new Error(
                        `Failed to get embed config after ${maxAttempts} attempts`,
                    );
                }
                return cy.wait(delayMs).then(() => checkConfig(attempt + 1));
            }

            const config = resp.body.results;
            const hasAllDashboards = expectedDashboardUuids.every((uuid) =>
                config.dashboardUuids?.includes(uuid),
            );

            if (hasAllDashboards) {
                return cy.wrap(resp);
            }

            if (attempt >= maxAttempts) {
                throw new Error(
                    `Embed config did not contain expected dashboards after ${maxAttempts} attempts. ` +
                        `Expected: ${expectedDashboardUuids.join(', ')}, ` +
                        `Got: ${config.dashboardUuids?.join(', ') || 'empty'}`,
                );
            }

            return cy.wait(delayMs).then(() => checkConfig(attempt + 1));
        });

    return checkConfig(1);
};
