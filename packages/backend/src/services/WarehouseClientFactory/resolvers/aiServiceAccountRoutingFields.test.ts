import { WarehouseTypes } from '@lightdash/common';
import { resolve } from 'node:path';
import { API } from 'typescript/unstable/sync';
import {
    aiServiceAccountFieldClassification,
    pickRoutingFields,
    type CredentialsFor,
    type SupportedWarehouseType,
} from './aiServiceAccountRoutingFields';

const credentialTypeNames = {
    [WarehouseTypes.BIGQUERY]: 'CreateBigqueryCredentials',
    [WarehouseTypes.DATABRICKS]: 'CreateDatabricksCredentials',
    [WarehouseTypes.REDSHIFT]: 'CreateRedshiftCredentials',
    [WarehouseTypes.ATHENA]: 'CreateAthenaCredentials',
    [WarehouseTypes.POSTGRES]: 'CreatePostgresCredentials',
    [WarehouseTypes.TRINO]: 'CreateTrinoCredentials',
    [WarehouseTypes.CLICKHOUSE]: 'CreateClickhouseCredentials',
    [WarehouseTypes.SNOWFLAKE]: 'CreateSnowflakeCredentials',
} as const satisfies Record<SupportedWarehouseType, string>;

const warehouseTypes = Object.keys(
    credentialTypeNames,
) as SupportedWarehouseType[];

it.each(warehouseTypes)(
    'copies only classified routing fields for %s',
    (type) => {
        const classification = aiServiceAccountFieldClassification[type];
        const fields = Object.entries(classification);
        const connection = Object.fromEntries([
            ...fields.map(([key]) => [key, `${type}:${key}`]),
            ['unknownField', `${type}:unknownField`],
        ]);
        const result = pickRoutingFields(
            type,
            connection as CredentialsFor<typeof type>,
        );

        expect(result).toStrictEqual(
            Object.fromEntries(
                fields
                    .filter(([, fieldClass]) => fieldClass === 'routing')
                    .map(([key]) => [key, connection[key]]),
            ),
        );
        for (const [key, fieldClass] of fields) {
            if (fieldClass === 'identity') {
                expect(result).not.toHaveProperty(key);
            }
        }
        expect(result).not.toHaveProperty('unknownField');
        expect(result).not.toHaveProperty('requireUserCredentials');
        expect(result).not.toHaveProperty('authenticationType');

        if (type === WarehouseTypes.DATABRICKS) {
            for (const field of [
                'oauthClientId',
                'oauthClientSecret',
                'token',
                'refreshToken',
                'personalAccessToken',
            ]) {
                expect(result).not.toHaveProperty(field);
            }
            for (const field of [
                'serverHostName',
                'httpPath',
                'catalog',
                'database',
                'compute',
                'startOfWeek',
                'dataTimezone',
            ]) {
                expect(result).toHaveProperty(field, connection[field]);
            }
        }
        if (type === WarehouseTypes.REDSHIFT) {
            expect(result).not.toHaveProperty('assumeRoleArn');
            expect(result).not.toHaveProperty('assumeRoleExternalId');
            expect(result).not.toHaveProperty('dbGroups');
            expect(result).not.toHaveProperty('awsSsoStartUrl');
            expect(result).not.toHaveProperty('awsSsoRegion');
            expect(result).not.toHaveProperty('awsSsoAccountId');
            expect(result).not.toHaveProperty('awsSsoRoleName');
        }
        if (type === WarehouseTypes.ATHENA) {
            expect(result).not.toHaveProperty('assumeRoleArn');
            expect(result).not.toHaveProperty('workGroup');
            expect(result).not.toHaveProperty('s3StagingDir');
            expect(result).not.toHaveProperty('s3DataDir');
        }
        if (
            type === WarehouseTypes.SNOWFLAKE ||
            type === WarehouseTypes.POSTGRES
        ) {
            expect(result).not.toHaveProperty('role');
        }
    },
);

it('omits undefined routing fields and preserves other falsy values', () => {
    expect(
        pickRoutingFields(WarehouseTypes.BIGQUERY, {
            type: WarehouseTypes.BIGQUERY,
            project: '',
            dataset: 'dataset',
            keyfileContents: {},
            location: undefined,
            priority: undefined,
            retries: undefined,
            maximumBytesBilled: undefined,
            timeoutSeconds: 0,
            startOfWeek: null,
            useSshTunnel: false,
        }),
    ).toStrictEqual({
        type: WarehouseTypes.BIGQUERY,
        project: '',
        dataset: 'dataset',
        timeoutSeconds: 0,
        startOfWeek: null,
        useSshTunnel: false,
    });
});

it('classifies every field declared by the source credential types', () => {
    const sourcePath = resolve(
        __dirname,
        '../../../../../common/src/types/projects.ts',
    );
    const configPath = resolve(
        __dirname,
        'tsconfig.aiServiceAccountRoutingFields.json',
    );
    const api = new API({
        fs: {
            fileExists: (file) => (file === configPath ? true : undefined),
            readFile: (file) =>
                file === configPath
                    ? JSON.stringify({
                          files: [sourcePath],
                          compilerOptions: {
                              noEmit: true,
                              skipLibCheck: true,
                              types: [],
                          },
                      })
                    : undefined,
        },
    });

    try {
        const snapshot = api.updateSnapshot({ openProjects: [configPath] });
        const project = snapshot.getProject(configPath);
        if (!project) {
            throw new Error('Could not load the credential type project');
        }
        const { program, checker } = project;
        const source = program.getSourceFile(sourcePath);
        if (!source) {
            throw new Error('Could not load projects.ts');
        }
        const moduleSymbol = checker.getSymbolAtLocation(source);
        if (!moduleSymbol) {
            throw new Error('Could not resolve the exports of projects.ts');
        }
        const exports = checker.getExportsOfModule(moduleSymbol);
        const propertyNames = (typeName: string): string[] => {
            const symbol = exports.find((entry) => entry.name === typeName);
            if (!symbol) {
                throw new Error(`Could not resolve ${typeName}`);
            }
            const type = checker.getDeclaredTypeOfSymbol(symbol);
            const members = type.isUnionType() ? type.getTypes() : [type];
            return members.flatMap((member) =>
                checker.getPropertiesOfType(member).map((field) => field.name),
            );
        };
        const sshFields = propertyNames('SshTunnelConfiguration');

        for (const type of warehouseTypes) {
            const classification = aiServiceAccountFieldClassification[type];
            const sourceFields = propertyNames(credentialTypeNames[type]);
            if ('useSshTunnel' in classification) {
                sourceFields.push(...sshFields);
            }
            expect(
                Object.keys(classification).sort(),
                `${type}: classify the new field as routing or identity in aiServiceAccountRoutingFields.ts`,
            ).toEqual([...new Set(sourceFields)].sort());
        }
        snapshot.dispose();
    } finally {
        api.close();
    }
}, 60_000);
