import {
    AthenaAuthenticationType,
    AWS_IAM_ROLE_ARN_INVALID_MESSAGE,
    BigqueryAuthenticationType,
    DbtProjectType,
    DefaultSupportedDbtVersion,
    RedshiftAuthenticationType,
    WarehouseTypes,
    type CreateRedshiftCredentials,
} from '@lightdash/common';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useForm } from '../formContext';
import { type ProjectConnectionForm } from '../types';
import {
    AthenaDefaultValues,
    BigQueryDefaultValues,
    PostgresDefaultValues,
    RedshiftDefaultValues,
} from './defaultValues';
import {
    createWarehouseValueValidators,
    SSH_TUNNEL_PUBLIC_KEY_REQUIRED_MESSAGE,
    warehouseValueValidators,
} from './validators';

const formValues = (
    warehouse: ProjectConnectionForm['warehouse'],
): ProjectConnectionForm => ({ warehouse }) as unknown as ProjectConnectionForm;

describe.each([
    ['postgres', WarehouseTypes.POSTGRES, PostgresDefaultValues],
    ['redshift', WarehouseTypes.REDSHIFT, RedshiftDefaultValues],
] as const)('%s sshTunnelPublicKey validation', (_label, type, defaults) => {
    const validators = [
        ['update', warehouseValueValidators[type].sshTunnelPublicKey],
        ['create', createWarehouseValueValidators[type].sshTunnelPublicKey],
    ] as const;

    it.each(validators)(
        '%s form rejects an empty key when the tunnel is enabled',
        (_form, validate) => {
            const values = formValues({ ...defaults, useSshTunnel: true });
            expect(validate('', values)).toBe(
                SSH_TUNNEL_PUBLIC_KEY_REQUIRED_MESSAGE,
            );
            expect(validate('   ', values)).toBe(
                SSH_TUNNEL_PUBLIC_KEY_REQUIRED_MESSAGE,
            );
        },
    );

    it.each(validators)(
        '%s form accepts a generated key when the tunnel is enabled',
        (_form, validate) => {
            const values = formValues({ ...defaults, useSshTunnel: true });
            expect(
                validate('ssh-rsa AAAA (generated)', values),
            ).toBeUndefined();
        },
    );

    it.each(validators)(
        '%s form ignores the key when the tunnel is disabled',
        (_form, validate) => {
            const values = formValues({ ...defaults, useSshTunnel: false });
            expect(validate('', values)).toBeUndefined();
        },
    );
});

const redshiftValues = (
    warehouse: Partial<CreateRedshiftCredentials>,
): ProjectConnectionForm => ({
    name: 'test project',
    dbt: { type: DbtProjectType.NONE },
    warehouse: {
        type: WarehouseTypes.REDSHIFT,
        host: 'host',
        user: '',
        password: '',
        dbname: 'dev',
        schema: 'public',
        port: 5439,
        ...warehouse,
    },
    dbtVersion: 'v1.10' as ProjectConnectionForm['dbtVersion'],
});

const { user, password, region, clusterIdentifier, workgroupName } =
    createWarehouseValueValidators[WarehouseTypes.REDSHIFT];

describe('createWarehouseValueValidators[REDSHIFT]', () => {
    it('requires user and password for password authentication', () => {
        const values = redshiftValues({
            authenticationType: RedshiftAuthenticationType.PASSWORD,
        });

        expect(user('', values)).toBe('User is required');
        expect(password('', values)).toBe('Password is required');
    });

    it('does not require user or password for IAM authentication', () => {
        const values = redshiftValues({
            authenticationType: RedshiftAuthenticationType.IAM,
            isServerless: false,
        });

        expect(password('', values)).toBeUndefined();
    });

    it('requires the database user for a provisioned IAM cluster but not for serverless', () => {
        const provisioned = redshiftValues({
            authenticationType: RedshiftAuthenticationType.IAM,
            isServerless: false,
        });
        const serverless = redshiftValues({
            authenticationType: RedshiftAuthenticationType.IAM,
            isServerless: true,
        });

        expect(user('', provisioned)).toBe('User is required');
        expect(user('', serverless)).toBeUndefined();
    });

    it('requires region and a cluster identifier for a provisioned IAM cluster', () => {
        const values = redshiftValues({
            authenticationType: RedshiftAuthenticationType.IAM,
            isServerless: false,
        });

        expect(region('', values)).toBe('AWS region is required');
        expect(clusterIdentifier('', values)).toBe(
            'Cluster identifier is required',
        );
        expect(workgroupName('', values)).toBeUndefined();
    });

    it('requires region and a workgroup name for a serverless IAM connection', () => {
        const values = redshiftValues({
            authenticationType: RedshiftAuthenticationType.IAM,
            isServerless: true,
        });

        expect(region('', values)).toBe('AWS region is required');
        expect(workgroupName('', values)).toBe('Workgroup name is required');
        expect(clusterIdentifier('', values)).toBeUndefined();
    });

    it('requires region but not a cluster identifier or workgroup name for IAM Identity Center', () => {
        const values = redshiftValues({
            authenticationType: RedshiftAuthenticationType.IAM_BROWSER,
        });

        expect(region('', values)).toBe('AWS region is required');
        expect(clusterIdentifier('', values)).toBeUndefined();
        expect(workgroupName('', values)).toBeUndefined();
        expect(user('', values)).toBeUndefined();
        expect(password('', values)).toBeUndefined();
    });
});

describe('athena web identity validation', () => {
    const validators = [
        ['update', warehouseValueValidators[WarehouseTypes.ATHENA]],
        ['create', createWarehouseValueValidators[WarehouseTypes.ATHENA]],
    ] as const;
    const webIdentity = formValues({
        ...AthenaDefaultValues,
        authenticationType: AthenaAuthenticationType.WEB_IDENTITY,
    });

    it.each(validators)('%s form rejects a malformed role ARN', (_form, v) => {
        expect(v.assumeRoleArn('not-an-arn', webIdentity)).toBe(
            AWS_IAM_ROLE_ARN_INVALID_MESSAGE,
        );
        expect(
            v.assumeRoleArn(
                'arn:aws:iam::123456789012:role/lightdash-athena',
                webIdentity,
            ),
        ).toBeUndefined();
    });

    it.each(validators)('%s form requires an audience', (_form, v) => {
        expect(v.webIdentityAudience('', webIdentity)).toBe(
            'Generate an audience to continue.',
        );
        expect(
            v.webIdentityAudience('lightdash-abc', webIdentity),
        ).toBeUndefined();
    });
});

describe.each([
    ['create', createWarehouseValueValidators[WarehouseTypes.BIGQUERY]],
    ['update', warehouseValueValidators[WarehouseTypes.BIGQUERY]],
] as const)('%s BigQuery workload identity validation', (_form, validators) => {
    const values: ProjectConnectionForm = {
        name: 'Test project',
        dbt: { type: DbtProjectType.NONE },
        dbtVersion: DefaultSupportedDbtVersion,
        warehouse: {
            ...BigQueryDefaultValues,
            authenticationType:
                BigqueryAuthenticationType.WORKLOAD_IDENTITY_FEDERATION,
        },
    };
    const provider =
        'projects/123456/locations/global/workloadIdentityPools/pool-id/providers/provider-id';

    it.each([
        '',
        'invalid',
        `https://iam.googleapis.com/${provider}`,
        provider.replace('123456', 'project-id'),
        provider.replace('global', 'us-east1'),
        provider.replace('pool-id', 'abc'),
        provider.replace('provider-id', 'a'.repeat(33)),
        provider.replace('provider-id', 'UPPERCASE'),
        `${provider}/extra`,
    ])('rejects an invalid provider: %s', (value) => {
        expect(
            validators.workloadIdentityProvider(value, values),
        ).toBeDefined();
    });

    it('accepts a provider resource name', () => {
        expect(
            validators.workloadIdentityProvider(provider, values),
        ).toBeUndefined();
    });

    it('accepts cleared federation fields after switching to key-file authentication', () => {
        const { result } = renderHook(() =>
            useForm({
                initialValues: {
                    ...values,
                    warehouse: {
                        ...BigQueryDefaultValues,
                        project: 'project-id',
                        dataset: 'dataset',
                        workloadIdentityProvider: undefined,
                        workloadIdentityAudience: undefined,
                    },
                },
                validate: { warehouse: validators },
            }),
        );
        act(() => {
            expect(result.current.validate()).toEqual({
                hasErrors: false,
                errors: {},
            });
        });
    });

    it.each(['with space', 'trailing\n', '\ttab', 'a'.repeat(257)])(
        'rejects an invalid audience: %s',
        (value) => {
            expect(validators.workloadIdentityAudience(value, values)).toBe(
                'Audience must be 256 characters or fewer and contain no whitespace.',
            );
        },
    );

    it.each(['', 'custom-audience', 'a'.repeat(256)])(
        'accepts an optional audience: %s',
        (value) => {
            expect(
                validators.workloadIdentityAudience(value, values),
            ).toBeUndefined();
        },
    );

    it.each([
        BigqueryAuthenticationType.PRIVATE_KEY,
        BigqueryAuthenticationType.ADC,
        BigqueryAuthenticationType.SSO,
        undefined,
    ])(
        'ignores federation fields for %s authentication',
        (authenticationType) => {
            const otherValues = {
                ...values,
                warehouse: { ...BigQueryDefaultValues, authenticationType },
            };
            expect(
                validators.workloadIdentityProvider('invalid', otherValues),
            ).toBeUndefined();
            expect(
                validators.workloadIdentityAudience('with space', otherValues),
            ).toBeUndefined();
        },
    );
});
