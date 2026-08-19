import { lightdashConfigMock } from './config/lightdashConfig.mock';

describe('knex connection acquisition timeout', () => {
    afterEach(() => {
        lightdashConfigMock.database.acquireConnectionTimeout = undefined;
        vi.resetModules();
    });

    it('keeps the Knex 60000ms default and the 30000ms pool default when unset', async () => {
        const knexConfig = (await import('./knexfile')).default;

        expect(knexConfig.development.acquireConnectionTimeout).toBeUndefined();
        expect(knexConfig.development.pool?.acquireTimeoutMillis).toBe(30000);
    });

    it('passes the configured timeout to Knex and the pool', async () => {
        lightdashConfigMock.database.acquireConnectionTimeout = 2500;
        vi.resetModules();

        const knexConfig = (await import('./knexfile')).default;

        expect(knexConfig.development.acquireConnectionTimeout).toBe(2500);
        expect(knexConfig.production.acquireConnectionTimeout).toBe(2500);
        expect(knexConfig.development.pool?.acquireTimeoutMillis).toBe(2500);
        expect(knexConfig.production.pool?.acquireTimeoutMillis).toBe(2500);
    });
});
