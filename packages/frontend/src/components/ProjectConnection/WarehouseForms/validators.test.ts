import {
    DbtProjectType,
    RedshiftAuthenticationType,
    WarehouseTypes,
    type CreateRedshiftCredentials,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { type ProjectConnectionForm } from '../types';
import { PostgresDefaultValues, RedshiftDefaultValues } from './defaultValues';
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
