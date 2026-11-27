import {
    ExploreType,
    type ApiConnectorType,
    type ApiSourceExplore,
} from '@lightdash/common';

/** Whether an explore reads a live source integration the organization has turned off. */
export const isExploreOfDisabledLiveIntegration = (
    explore: {
        type?: ExploreType;
        apiSource?: Pick<ApiSourceExplore, 'integration'>;
    },
    disabledIntegrations: ReadonlySet<ApiConnectorType>,
): boolean =>
    disabledIntegrations.size > 0 &&
    explore.type === ExploreType.API_SOURCE &&
    explore.apiSource !== undefined &&
    disabledIntegrations.has(explore.apiSource.integration);

/**
 * SQL keeping the cached explores that read none of the given integrations,
 * with the integrations bound as one array parameter.
 */
export const excludeLiveIntegrationsSql = (exploreColumn: string) =>
    `NOT COALESCE(${exploreColumn}->>'type' = '${ExploreType.API_SOURCE}' AND ${exploreColumn}->'apiSource'->>'integration' = ANY(?), false)`;
