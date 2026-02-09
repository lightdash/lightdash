import { DbtProjectType, WarehouseTypes } from '../types/projects';
import { hasConnectionChanges } from './connectionChanges';

describe('hasConnectionChanges', () => {
    it('should return false when both configs are identical', () => {
        const warehouse = {
            type: WarehouseTypes.POSTGRES as const,
            host: 'localhost',
            port: 5432,
            user: 'admin',
            password: 'secret',
            dbname: 'mydb',
            schema: 'public',
        };
        const dbt = {
            type: DbtProjectType.GITHUB as const,
            repository: 'org/repo',
            branch: 'main',
            project_sub_path: '/',
            host_domain: 'github.com',
            authorization_method: 'personal_access_token' as const,
            personal_access_token: 'ghp_xxx',
        };

        expect(
            hasConnectionChanges(
                { warehouseConnection: warehouse, dbtConnection: dbt },
                { warehouseConnection: warehouse, dbtConnection: dbt },
            ),
        ).toBe(false);
    });

    it('should return true when warehouse connection changes', () => {
        const before = {
            type: WarehouseTypes.POSTGRES as const,
            host: 'localhost',
            port: 5432,
            user: 'admin',
            password: 'secret',
            dbname: 'mydb',
            schema: 'public',
        };
        const after = {
            ...before,
            host: 'production.db.com',
        };

        expect(
            hasConnectionChanges(
                { warehouseConnection: before },
                { warehouseConnection: after },
            ),
        ).toBe(true);
    });

    it('should return true when dbt connection changes', () => {
        const before = {
            type: DbtProjectType.GITHUB as const,
            repository: 'org/repo',
            branch: 'main',
            project_sub_path: '/',
            host_domain: 'github.com',
            authorization_method: 'personal_access_token' as const,
            personal_access_token: 'ghp_xxx',
        };
        const after = {
            ...before,
            branch: 'develop',
        };

        expect(
            hasConnectionChanges(
                { dbtConnection: before },
                { dbtConnection: after },
            ),
        ).toBe(true);
    });

    it('should return false when both connections are undefined', () => {
        expect(hasConnectionChanges({}, {})).toBe(false);
    });

    it('should return true when warehouse connection is removed', () => {
        const warehouse = {
            type: WarehouseTypes.POSTGRES as const,
            host: 'localhost',
            port: 5432,
            user: 'admin',
            password: 'secret',
            dbname: 'mydb',
            schema: 'public',
        };

        expect(
            hasConnectionChanges({ warehouseConnection: warehouse }, {}),
        ).toBe(true);
    });

    it('should return true when warehouse connection is added', () => {
        const warehouse = {
            type: WarehouseTypes.POSTGRES as const,
            host: 'localhost',
            port: 5432,
            user: 'admin',
            password: 'secret',
            dbname: 'mydb',
            schema: 'public',
        };

        expect(
            hasConnectionChanges({}, { warehouseConnection: warehouse }),
        ).toBe(true);
    });

    it('should return true when dbt connection is removed', () => {
        const dbt = {
            type: DbtProjectType.GITHUB as const,
            repository: 'org/repo',
            branch: 'main',
            project_sub_path: '/',
            host_domain: 'github.com',
            authorization_method: 'personal_access_token' as const,
            personal_access_token: 'ghp_xxx',
        };

        expect(hasConnectionChanges({ dbtConnection: dbt }, {})).toBe(true);
    });

    it('should return true when warehouse type changes', () => {
        const before = {
            type: WarehouseTypes.POSTGRES as const,
            host: 'localhost',
            port: 5432,
            user: 'admin',
            password: 'secret',
            dbname: 'mydb',
            schema: 'public',
        };
        const after = {
            type: WarehouseTypes.BIGQUERY as const,
            project: 'my-project',
            dataset: 'my_dataset',
            keyfileContents: {},
            timeoutSeconds: 300,
            priority: 'interactive' as const,
            retries: 3,
            location: 'US',
            maximumBytesBilled: 1000000,
        };

        expect(
            hasConnectionChanges(
                { warehouseConnection: before },
                { warehouseConnection: after },
            ),
        ).toBe(true);
    });

    it('should return false when nested objects have same values but different key order', () => {
        const before = {
            type: WarehouseTypes.BIGQUERY as const,
            project: 'my-project',
            dataset: 'my_dataset',
            keyfileContents: { project_id: 'abc', client_email: 'x@y.com' },
            timeoutSeconds: 300,
            priority: 'interactive' as const,
            retries: 3,
            location: 'US',
            maximumBytesBilled: 1000000,
        };
        const after = {
            type: WarehouseTypes.BIGQUERY as const,
            project: 'my-project',
            dataset: 'my_dataset',
            keyfileContents: { client_email: 'x@y.com', project_id: 'abc' },
            timeoutSeconds: 300,
            priority: 'interactive' as const,
            retries: 3,
            location: 'US',
            maximumBytesBilled: 1000000,
        };

        expect(
            hasConnectionChanges(
                { warehouseConnection: before },
                { warehouseConnection: after },
            ),
        ).toBe(false);
    });

    it('should detect changes when key order differs but values are same', () => {
        const before = {
            type: WarehouseTypes.POSTGRES as const,
            host: 'localhost',
            port: 5432,
            user: 'admin',
            password: 'secret',
            dbname: 'mydb',
            schema: 'public',
        };
        const after = {
            schema: 'public',
            dbname: 'mydb',
            password: 'secret',
            user: 'admin',
            port: 5432,
            host: 'localhost',
            type: WarehouseTypes.POSTGRES as const,
        };

        expect(
            hasConnectionChanges(
                { warehouseConnection: before },
                { warehouseConnection: after },
            ),
        ).toBe(false);
    });
});
