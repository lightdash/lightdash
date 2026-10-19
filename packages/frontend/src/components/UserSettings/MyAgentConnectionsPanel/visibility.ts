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
): {
    showSnowflakeSignIn: boolean;
    serviceAccountWarehouses: WarehouseTypes[];
} => {
    const hasWarehouse = (warehouseType: WarehouseTypes) =>
        projects.some((project) => project.warehouseType === warehouseType);
    const preferredOrder = [
        WarehouseTypes.SNOWFLAKE,
        WarehouseTypes.BIGQUERY,
        WarehouseTypes.DATABRICKS,
    ];
    const serviceAccountWarehouses = rules
        .filter(
            ({ warehouseType, source }) =>
                source === 'ai_service_account' && hasWarehouse(warehouseType),
        )
        .map(({ warehouseType }) => warehouseType);
    return {
        showSnowflakeSignIn:
            hasWarehouse(WarehouseTypes.SNOWFLAKE) &&
            rules.some(
                ({ warehouseType, source }) =>
                    warehouseType === WarehouseTypes.SNOWFLAKE &&
                    source === 'agent_sign_in',
            ),
        serviceAccountWarehouses: [
            ...preferredOrder.filter((warehouseType) =>
                serviceAccountWarehouses.includes(warehouseType),
            ),
            ...serviceAccountWarehouses.filter(
                (warehouseType) => !preferredOrder.includes(warehouseType),
            ),
        ],
    };
};
