import { lightdashConfigMock } from './config/lightdashConfig.mock';

describe('knex connection acquisition timeout', () => {
    afterEach(() => {
        lightdashConfigMock.database.acquireConnectionTimeout = undefined;
        vi.resetModules();
    });

    it('leaves the timeout unset so Knex uses its 60000ms default', async () => {
        const knexConfig = (await import('./knexfile')).default;

        expect(knexConfig.development.acquireConnectionTimeout).toBeUndefined();
        expect(
            knexConfig.development.pool?.acquireTimeoutMillis,
        ).toBeUndefined();
    });

    it('passes the configured timeout to Knex', async () => {
        lightdashConfigMock.database.acquireConnectionTimeout = 2500;
        vi.resetModules();

        const knexConfig = (await import('./knexfile')).default;

        expect(knexConfig.development.acquireConnectionTimeout).toBe(2500);
        expect(knexConfig.production.acquireConnectionTimeout).toBe(2500);
    });
});
