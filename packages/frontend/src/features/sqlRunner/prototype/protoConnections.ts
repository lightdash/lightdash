import {
    WarehouseTableType,
    type WarehouseTablesCatalog,
} from '@lightdash/common';

export type ProtoConnection = {
    id: string;
    name: string;
    catalog: WarehouseTablesCatalog;
};

const QUERY_PARAM = 'protoConnections';
const ENABLED_STORAGE_KEY = 'lightdash.proto.spk2168.enabled';
const LAST_CONNECTION_STORAGE_KEY = 'lightdash.proto.spk2168.lastConnectionId';

const readEnabledSwitch = (): boolean => {
    if (import.meta.env.VITE_PROTO_MULTI_CONNECTION === 'true') return true;
    try {
        const param = new URLSearchParams(window.location.search).get(
            QUERY_PARAM,
        );
        if (param !== null) {
            const isOn = param !== '0' && param !== 'false';
            window.sessionStorage.setItem(ENABLED_STORAGE_KEY, String(isOn));
            return isOn;
        }
        return window.sessionStorage.getItem(ENABLED_STORAGE_KEY) === 'true';
    } catch {
        return false;
    }
};

export const isProtoMultiConnectionEnabled = readEnabledSwitch();

const table = (tableType: WarehouseTableType = WarehouseTableType.TABLE) => ({
    tableType,
});

export const PROTO_CONNECTIONS: ProtoConnection[] = [
    {
        id: 'conn-ap-southeast-1',
        name: 'AwsDataCatalog ap-southeast-1',
        catalog: {
            sg_core: {
                raw: {
                    customers: table(),
                    orders: table(),
                    payments: table(),
                    shipments: table(),
                },
                analytics: {
                    dim_customers: table(),
                    fct_orders: table(),
                    v_active_customers: table(WarehouseTableType.VIEW),
                },
            },
            sg_marketing: {
                campaigns: {
                    ad_spend: table(),
                    attribution_touchpoints: table(),
                },
                web: {
                    sessions: table(),
                    page_views: table(WarehouseTableType.EXTERNAL),
                },
            },
            sg_finance: {
                ledger: {
                    invoices: table(),
                    revenue_daily: table(WarehouseTableType.MATERIALIZED_VIEW),
                },
            },
        },
    },
    {
        id: 'conn-ap-east-1',
        name: 'AwsDataCatalog ap-east-1',
        catalog: {
            hk_core: {
                raw: {
                    customers: table(),
                    orders: table(),
                },
                analytics: {
                    dim_customers: table(),
                    fct_orders: table(),
                },
            },
            hk_marketing: {
                campaigns: {
                    ad_spend: table(),
                },
            },
        },
    },
];

const getProtoConnection = (
    connectionId: string,
): ProtoConnection | undefined =>
    PROTO_CONNECTIONS.find((connection) => connection.id === connectionId);

export const readLastUsedConnectionId = (): string | undefined => {
    try {
        const stored = window.localStorage.getItem(LAST_CONNECTION_STORAGE_KEY);
        return stored && getProtoConnection(stored) ? stored : undefined;
    } catch {
        return undefined;
    }
};

export const writeLastUsedConnectionId = (connectionId: string): void => {
    try {
        window.localStorage.setItem(LAST_CONNECTION_STORAGE_KEY, connectionId);
    } catch {
        return;
    }
};
