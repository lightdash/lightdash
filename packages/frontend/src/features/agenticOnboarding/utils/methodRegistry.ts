import { WarehouseTypes } from '@lightdash/common';

export enum ConnectMethodId {
    KEYPAIR = 'keypair',
    CLI_SSO = 'cli_sso',
    PASSWORD = 'password',
    PASTE = 'paste',
    MANUAL = 'manual',
}

export type ConnectMethodDescriptor = {
    id: ConnectMethodId;
    label: string;
    description: string;
    recommended: boolean;
};

const SNOWFLAKE_METHODS: ConnectMethodDescriptor[] = [
    {
        id: ConnectMethodId.KEYPAIR,
        label: 'Key-pair authentication',
        description:
            'A durable service credential — best for production and scheduled refreshes.',
        recommended: true,
    },
    {
        id: ConnectMethodId.CLI_SSO,
        label: 'Sign in with Snowflake SSO',
        description:
            'Authenticate as yourself using our CLI — no admin required.',
        recommended: false,
    },
    {
        id: ConnectMethodId.PASSWORD,
        label: 'Username & password',
        description: 'Connect with a Snowflake user and password.',
        recommended: false,
    },
    {
        id: ConnectMethodId.PASTE,
        label: 'Paste connection details',
        description:
            'Drop in a connection string or dbt profiles.yml — we detect the rest.',
        recommended: false,
    },
    {
        id: ConnectMethodId.MANUAL,
        label: 'Enter details manually',
        description: 'Fill in the full connection form yourself.',
        recommended: false,
    },
];

const MANUAL_ONLY: ConnectMethodDescriptor[] = [
    {
        id: ConnectMethodId.MANUAL,
        label: 'Enter details manually',
        description: 'Fill in the full connection form yourself.',
        recommended: true,
    },
];

const methodsByWarehouse: Partial<
    Record<WarehouseTypes, ConnectMethodDescriptor[]>
> = {
    [WarehouseTypes.SNOWFLAKE]: SNOWFLAKE_METHODS,
};

export const getMethodsForWarehouse = (
    warehouse: WarehouseTypes,
): ConnectMethodDescriptor[] => methodsByWarehouse[warehouse] ?? MANUAL_ONLY;

export const isValidMethodForWarehouse = (
    warehouse: WarehouseTypes,
    methodId: string,
): methodId is ConnectMethodId =>
    getMethodsForWarehouse(warehouse).some((m) => m.id === methodId);
