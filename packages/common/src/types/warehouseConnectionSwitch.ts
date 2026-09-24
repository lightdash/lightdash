import { type WarehouseTypes } from './projects';
import { type ApiCreateWarehouseConnectionRequest } from './warehouseConnections';

export const WAREHOUSE_CONNECTION_SWITCH_PLAN_CHANGED_MESSAGE =
    "The project's connection changed. Run the preview again.";

export const WAREHOUSE_CONNECTION_ALREADY_MULTI_MESSAGE =
    'This project already has multiple connections. Use Add connection.';

export type WarehouseConnectionSwitchOriginal = {
    name: string;
    listAllDatabases: boolean;
    additionalDatabases: string[];
};

export type ApiWarehouseConnectionSwitchRequest = {
    original: WarehouseConnectionSwitchOriginal;
    connection: ApiCreateWarehouseConnectionRequest;
};

export type ApiExecuteWarehouseConnectionSwitchRequest =
    ApiWarehouseConnectionSwitchRequest & {
        planHash: string;
        idempotencyKey: string;
    };

export type WarehouseConnectionSwitchContentCounts = {
    explores: number;
    sqlCharts: number;
    sqlChartVersions: number;
    dbtSources: number;
    scheduledDeliveries: number;
    dashboards: number;
};

export type WarehouseConnectionSwitchPlan = {
    planHash: string;
    original: WarehouseConnectionSwitchOriginal & {
        warehouseType: WarehouseTypes;
    };
    connection: {
        name: string;
        warehouseType: WarehouseTypes;
        database: string | null;
        usesOrganizationCredentials: boolean;
    };
    staysOnOriginal: WarehouseConnectionSwitchContentCounts;
    personalCredentials: {
        usersWithPersonalCredentials: number;
        requireUserCredentials: boolean;
    };
};

export type WarehouseConnectionSwitchAvailability = {
    canSwitch: boolean;
    reason: string | null;
    originalWarehouseType: WarehouseTypes | null;
};

export type WarehouseConnectionSwitchResult = {
    eventUuid: string;
    originalWarehouseConnectionUuid: string;
    warehouseConnectionUuid: string;
};

export type ApiWarehouseConnectionSwitchAvailabilityResponse = {
    status: 'ok';
    results: WarehouseConnectionSwitchAvailability;
};

export type ApiWarehouseConnectionSwitchPlanResponse = {
    status: 'ok';
    results: WarehouseConnectionSwitchPlan;
};

export type ApiWarehouseConnectionSwitchResponse = {
    status: 'ok';
    results: WarehouseConnectionSwitchResult;
};
