import {
    WarehouseTypes,
    type CreateWarehouseCredentials,
    type SshTunnelConfiguration,
} from '@lightdash/common';

export type SupportedWarehouseType = Exclude<
    WarehouseTypes,
    WarehouseTypes.DUCKDB
>;

export type CredentialsFor<W extends SupportedWarehouseType> =
    W extends WarehouseTypes.BIGQUERY
        ? Extract<CreateWarehouseCredentials, { type: W }> &
              SshTunnelConfiguration
        : Extract<CreateWarehouseCredentials, { type: W }>;

type Keys<T> = T extends unknown ? keyof T : never;
type FieldClass = 'routing' | 'identity';

export const aiServiceAccountFieldClassification = {
    [WarehouseTypes.BIGQUERY]: {
        type: 'routing',
        project: 'routing',
        dataset: 'routing',
        threads: 'routing',
        timeoutSeconds: 'routing',
        priority: 'routing',
        retries: 'routing',
        location: 'routing',
        maximumBytesBilled: 'routing',
        executionProject: 'routing',
        accessUrl: 'routing',
        startOfWeek: 'routing',
        dataTimezone: 'routing',
        useSshTunnel: 'routing',
        sshTunnelHost: 'routing',
        sshTunnelPort: 'routing',
        sshTunnelUser: 'routing',
        sshTunnelPublicKey: 'routing',
        sshTunnelPrivateKey: 'routing',
        keyfileContents: 'identity',
        allowUserCredentials: 'identity',
        authenticationType: 'identity',
        requireUserCredentials: 'identity',
    },
    [WarehouseTypes.DATABRICKS]: {
        type: 'routing',
        catalog: 'routing',
        database: 'routing',
        serverHostName: 'routing',
        httpPath: 'routing',
        compute: 'routing',
        startOfWeek: 'routing',
        dataTimezone: 'routing',
        personalAccessToken: 'identity',
        refreshToken: 'identity',
        token: 'identity',
        oauthClientId: 'identity',
        oauthClientSecret: 'identity',
        authenticationType: 'identity',
        requireUserCredentials: 'identity',
    },
    [WarehouseTypes.REDSHIFT]: {
        type: 'routing',
        host: 'routing',
        port: 'routing',
        dbname: 'routing',
        schema: 'routing',
        threads: 'routing',
        keepalivesIdle: 'routing',
        sslmode: 'routing',
        ra3Node: 'routing',
        timeoutSeconds: 'routing',
        region: 'routing',
        isServerless: 'routing',
        clusterIdentifier: 'routing',
        workgroupName: 'routing',
        startOfWeek: 'routing',
        dataTimezone: 'routing',
        useSshTunnel: 'routing',
        sshTunnelHost: 'routing',
        sshTunnelPort: 'routing',
        sshTunnelUser: 'routing',
        sshTunnelPublicKey: 'routing',
        sshTunnelPrivateKey: 'routing',
        user: 'identity',
        password: 'identity',
        autoCreate: 'identity',
        dbGroups: 'identity',
        accessKeyId: 'identity',
        secretAccessKey: 'identity',
        sessionToken: 'identity',
        assumeRoleArn: 'identity',
        assumeRoleExternalId: 'identity',
        awsSsoStartUrl: 'identity',
        awsSsoRegion: 'identity',
        awsSsoAccountId: 'identity',
        awsSsoRoleName: 'identity',
        authenticationType: 'identity',
        requireUserCredentials: 'identity',
    },
    [WarehouseTypes.ATHENA]: {
        type: 'routing',
        region: 'routing',
        database: 'routing',
        schema: 'routing',
        threads: 'routing',
        numRetries: 'routing',
        startOfWeek: 'routing',
        dataTimezone: 'routing',
        accessKeyId: 'identity',
        secretAccessKey: 'identity',
        sessionToken: 'identity',
        assumeRoleArn: 'identity',
        assumeRoleExternalId: 'identity',
        webIdentityAudience: 'identity',
        workGroup: 'identity',
        s3StagingDir: 'identity',
        s3DataDir: 'identity',
        authenticationType: 'identity',
        requireUserCredentials: 'identity',
    },
    [WarehouseTypes.POSTGRES]: {
        type: 'routing',
        host: 'routing',
        port: 'routing',
        dbname: 'routing',
        schema: 'routing',
        threads: 'routing',
        keepalivesIdle: 'routing',
        searchPath: 'routing',
        timeoutSeconds: 'routing',
        sslmode: 'routing',
        sslrootcert: 'routing',
        sslrootcertFileName: 'routing',
        startOfWeek: 'routing',
        dataTimezone: 'routing',
        useSshTunnel: 'routing',
        sshTunnelHost: 'routing',
        sshTunnelPort: 'routing',
        sshTunnelUser: 'routing',
        sshTunnelPublicKey: 'routing',
        sshTunnelPrivateKey: 'routing',
        user: 'identity',
        password: 'identity',
        role: 'identity',
        sslcert: 'identity',
        sslcertFileName: 'identity',
        sslkey: 'identity',
        sslkeyFileName: 'identity',
        requireUserCredentials: 'identity',
    },
    [WarehouseTypes.TRINO]: {
        type: 'routing',
        host: 'routing',
        port: 'routing',
        dbname: 'routing',
        schema: 'routing',
        http_scheme: 'routing',
        source: 'routing',
        startOfWeek: 'routing',
        dataTimezone: 'routing',
        user: 'identity',
        password: 'identity',
        requireUserCredentials: 'identity',
    },
    [WarehouseTypes.CLICKHOUSE]: {
        type: 'routing',
        host: 'routing',
        port: 'routing',
        schema: 'routing',
        secure: 'routing',
        timeoutSeconds: 'routing',
        startOfWeek: 'routing',
        dataTimezone: 'routing',
        user: 'identity',
        password: 'identity',
        requireUserCredentials: 'identity',
    },
    [WarehouseTypes.SNOWFLAKE]: {
        type: 'routing',
        account: 'routing',
        database: 'routing',
        warehouse: 'routing',
        schema: 'routing',
        threads: 'routing',
        clientSessionKeepAlive: 'routing',
        accessUrl: 'routing',
        quotedIdentifiersIgnoreCase: 'routing',
        disableTimestampConversion: 'routing',
        timeoutSeconds: 'routing',
        override: 'routing',
        startOfWeek: 'routing',
        dataTimezone: 'routing',
        user: 'identity',
        password: 'identity',
        requireAgentSession: 'identity',
        privateKey: 'identity',
        privateKeyPass: 'identity',
        refreshToken: 'identity',
        token: 'identity',
        role: 'identity',
        queryTag: 'identity',
        organizationWarehouseCredentialsUuid: 'identity',
        authenticationType: 'identity',
        requireUserCredentials: 'identity',
    },
} as const satisfies {
    [W in SupportedWarehouseType]: Record<Keys<CredentialsFor<W>>, FieldClass>;
};

type RoutingKeys<W extends SupportedWarehouseType> = {
    [K in keyof (typeof aiServiceAccountFieldClassification)[W]]: (typeof aiServiceAccountFieldClassification)[W][K] extends 'routing'
        ? K
        : never;
}[keyof (typeof aiServiceAccountFieldClassification)[W]];

type RoutingFields<W extends SupportedWarehouseType> =
    W extends SupportedWarehouseType
        ? Pick<
              CredentialsFor<W>,
              Extract<RoutingKeys<W>, keyof CredentialsFor<W>>
          >
        : never;

export const pickRoutingFields = <W extends SupportedWarehouseType>(
    type: W,
    connection: CredentialsFor<W>,
): RoutingFields<W> =>
    Object.fromEntries(
        Object.entries(aiServiceAccountFieldClassification[type]).flatMap(
            ([key, fieldClass]) => {
                const value = connection[key as keyof CredentialsFor<W>];
                return fieldClass === 'routing' && value !== undefined
                    ? [[key, value]]
                    : [];
            },
        ),
    ) as RoutingFields<W>;
