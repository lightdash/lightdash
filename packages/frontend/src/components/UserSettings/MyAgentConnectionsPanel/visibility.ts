import {
    WarehouseTypes,
    type OrganizationAgentIdentityRule,
    type OrganizationProject,
} from '@lightdash/common';

export const shouldShowMyAgentConnections = (
    flagEnabled: boolean,
    rules: OrganizationAgentIdentityRule[],
): boolean =>
    flagEnabled && rules.some(({ source }) => source !== 'marked_person');

export const getAgentConnectionVisibility = (
    rules: OrganizationAgentIdentityRule[],
    projects: OrganizationProject[],
) => {
    const hasWarehouse = (warehouseType: WarehouseTypes) =>
        projects.some((project) => project.warehouseType === warehouseType);
    return {
        showSnowflake:
            hasWarehouse(WarehouseTypes.SNOWFLAKE) &&
            rules.some(
                ({ warehouseType, source }) =>
                    warehouseType === WarehouseTypes.SNOWFLAKE &&
                    source === 'agent_sign_in',
            ),
        showBigQuery:
            hasWarehouse(WarehouseTypes.BIGQUERY) &&
            rules.some(
                ({ warehouseType, source }) =>
                    warehouseType === WarehouseTypes.BIGQUERY &&
                    source === 'ai_service_account',
            ),
    };
};
