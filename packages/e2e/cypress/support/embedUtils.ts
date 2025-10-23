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
