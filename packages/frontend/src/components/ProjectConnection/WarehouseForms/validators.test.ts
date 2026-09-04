import {
    DbtProjectType,
    RedshiftAuthenticationType,
    WarehouseTypes,
    type CreateRedshiftCredentials,
} from '@lightdash/common';
import { type ProjectConnectionForm } from '../types';
import { createWarehouseValueValidators } from './validators';

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
