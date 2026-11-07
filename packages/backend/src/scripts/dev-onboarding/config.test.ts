import { assertLocalTarget } from './config';

describe('onboarding fixture target', () => {
    it.each(['localhost', '127.0.0.1', '::1'])(
        'accepts a local database at %s',
        (databaseHost) => {
            expect(() =>
                assertLocalTarget({
                    siteUrl: 'http://localhost:3070',
                    databaseHost,
                    nodeEnv: 'development',
                }),
            ).not.toThrow();
        },
    );
    it.each([
        {
            siteUrl: 'https://app.example.com',
            databaseHost: 'localhost',
            nodeEnv: 'development',
        },
        {
            siteUrl: 'http://localhost:3070',
            databaseHost: 'production-db',
            nodeEnv: 'development',
        },
        {
            siteUrl: 'http://localhost:3070',
            databaseHost: 'localhost',
            nodeEnv: 'production',
        },
        {
            siteUrl: 'http://localhost.attacker.test:3070',
            databaseHost: 'localhost',
            nodeEnv: 'development',
        },
    ])('refuses a non-development target %o', (target) => {
        expect(() => assertLocalTarget(target)).toThrow('local development');
    });
});
