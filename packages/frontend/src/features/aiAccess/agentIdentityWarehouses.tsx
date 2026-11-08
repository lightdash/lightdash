import {
    WarehouseTypes,
    type AiServiceAccountTestResult,
    type AiServiceAccountWarehouse,
    type OrganizationAgentIdentityRule,
    type WarehouseCredentials,
} from '@lightdash/common';
import { type ReactNode } from 'react';
import { type AiServiceAccountFormProps } from './AiServiceAccountForm';
import { AthenaAgentSetup } from './AthenaAgentSetup';
import { AthenaAiServiceAccountForm } from './AthenaAiServiceAccountForm';
import { BigQueryAgentSetup } from './BigQueryAgentSetup';
import { BigqueryAiServiceAccountForm } from './BigqueryAiServiceAccountForm';
import { ClickhouseAgentSetup } from './ClickhouseAgentSetup';
import { DatabricksAgentSetup } from './DatabricksAgentSetup';
import { DatabricksAiServiceAccountForm } from './DatabricksAiServiceAccountForm';
import { PostgresAgentSetup } from './PostgresAgentSetup';
import { RedshiftAgentSetup } from './RedshiftAgentSetup';
import { getSnowflakeAiPrincipal } from './snowflakeAiPrincipal';
import { SnowflakeAiServiceAccountForm } from './SnowflakeAiServiceAccountForm';
import { SnowflakeAiServiceAccountSetup } from './SnowflakeAiServiceAccountSetup';
import { TrinoAgentSetup } from './TrinoAgentSetup';
import { UserPasswordAiServiceAccountForm } from './UserPasswordAiServiceAccountForm';

export type AiServiceAccountConnection = Extract<
    WarehouseCredentials,
    { type: AiServiceAccountWarehouse }
>;

export type AiServiceAccountRule = OrganizationAgentIdentityRule & {
    warehouseType: AiServiceAccountWarehouse;
};

type AgentIdentityWarehouse<W extends AiServiceAccountWarehouse> = {
    name: string;
    methodLabel: string;
    usesPersistedVerification: boolean;
    resolvePrincipal: (
        verification: AiServiceAccountTestResult | null,
    ) => string | null;
    renderSetup: (
        connection: Extract<AiServiceAccountConnection, { type: W }>,
    ) => ReactNode;
    renderForm: (props: AiServiceAccountFormProps) => ReactNode;
};

const getVerifiedPrincipal = (
    verification: AiServiceAccountTestResult | null,
): string | null => (verification?.ok ? verification.principal : null);

export const agentIdentityWarehouses: {
    [W in AiServiceAccountWarehouse]: AgentIdentityWarehouse<W>;
} = {
    [WarehouseTypes.POSTGRES]: {
        name: 'Postgres',
        methodLabel: 'User and password',
        usesPersistedVerification: true,
        resolvePrincipal: getVerifiedPrincipal,
        renderSetup: (connection) => (
            <PostgresAgentSetup connection={connection} />
        ),
        renderForm: (props) => (
            <UserPasswordAiServiceAccountForm
                {...props}
                warehouseType={WarehouseTypes.POSTGRES}
                userDescription="The Postgres login role for agents"
            />
        ),
    },
    [WarehouseTypes.REDSHIFT]: {
        name: 'Redshift',
        methodLabel: 'User and password',
        usesPersistedVerification: true,
        resolvePrincipal: getVerifiedPrincipal,
        renderSetup: (connection) => (
            <RedshiftAgentSetup connection={connection} />
        ),
        renderForm: (props) => (
            <UserPasswordAiServiceAccountForm
                {...props}
                warehouseType={WarehouseTypes.REDSHIFT}
                userDescription="The Redshift database user for agents"
            />
        ),
    },
    [WarehouseTypes.TRINO]: {
        name: 'Trino',
        methodLabel: 'User and password',
        usesPersistedVerification: true,
        resolvePrincipal: getVerifiedPrincipal,
        renderSetup: (connection) => (
            <TrinoAgentSetup connection={connection} />
        ),
        renderForm: (props) => (
            <UserPasswordAiServiceAccountForm
                {...props}
                warehouseType={WarehouseTypes.TRINO}
                userDescription="The Trino login for agents"
            />
        ),
    },
    [WarehouseTypes.CLICKHOUSE]: {
        name: 'ClickHouse',
        methodLabel: 'User and password',
        usesPersistedVerification: true,
        resolvePrincipal: getVerifiedPrincipal,
        renderSetup: (connection) => (
            <ClickhouseAgentSetup connection={connection} />
        ),
        renderForm: (props) => (
            <UserPasswordAiServiceAccountForm
                {...props}
                warehouseType={WarehouseTypes.CLICKHOUSE}
                userDescription="The ClickHouse user for agents"
            />
        ),
    },
    [WarehouseTypes.ATHENA]: {
        name: 'Athena',
        methodLabel: 'Access keys',
        usesPersistedVerification: true,
        resolvePrincipal: getVerifiedPrincipal,
        renderSetup: (connection) => (
            <AthenaAgentSetup connection={connection} />
        ),
        renderForm: (props) => <AthenaAiServiceAccountForm {...props} />,
    },
    [WarehouseTypes.SNOWFLAKE]: {
        name: 'Snowflake',
        methodLabel: 'Key pair',
        usesPersistedVerification: true,
        resolvePrincipal: getSnowflakeAiPrincipal,
        renderSetup: () => <SnowflakeAiServiceAccountSetup />,
        renderForm: (props) => <SnowflakeAiServiceAccountForm {...props} />,
    },
    [WarehouseTypes.BIGQUERY]: {
        name: 'BigQuery',
        methodLabel: 'Key file',
        usesPersistedVerification: false,
        resolvePrincipal: getVerifiedPrincipal,
        renderSetup: (connection) => (
            <BigQueryAgentSetup connection={connection} />
        ),
        renderForm: (props) => <BigqueryAiServiceAccountForm {...props} />,
    },
    [WarehouseTypes.DATABRICKS]: {
        name: 'Databricks',
        methodLabel: 'Client ID and secret',
        usesPersistedVerification: true,
        resolvePrincipal: getVerifiedPrincipal,
        renderSetup: (connection) => (
            <DatabricksAgentSetup connection={connection} />
        ),
        renderForm: (props) => <DatabricksAiServiceAccountForm {...props} />,
    },
};

export const renderAiServiceAccountSetup = <
    W extends AiServiceAccountWarehouse,
>(
    warehouseType: W,
    connection: Extract<AiServiceAccountConnection, { type: W }>,
): ReactNode => agentIdentityWarehouses[warehouseType].renderSetup(connection);
