import { partialParseBaselineKey } from './partialParse';

describe('partialParseBaselineKey', () => {
    const inputs = {
        bundle: {
            version: 1 as const,
            files: [{ path: 'models/orders.yml', content: 'version: 2\n' }],
        },
        databasePath: '/srv/playground/jaffle_shop.duckdb',
        dbtVersion: '1.12.0',
        sandboxPath: '/usr/local/dbt1.12/bin:/usr/bin',
    };

    it('is stable for the same inputs', () => {
        expect(partialParseBaselineKey(inputs)).toBe(
            partialParseBaselineKey({ ...inputs }),
        );
    });

    it('changes with the bundle, the profile, the dbt version and the dbt on PATH', () => {
        const key = partialParseBaselineKey(inputs);
        expect(
            partialParseBaselineKey({
                ...inputs,
                bundle: {
                    version: 1,
                    files: [{ path: 'models/orders.yml', content: 'x' }],
                },
            }),
        ).not.toBe(key);
        expect(
            partialParseBaselineKey({
                ...inputs,
                databasePath: '/other.duckdb',
            }),
        ).not.toBe(key);
        expect(
            partialParseBaselineKey({ ...inputs, dbtVersion: '1.11.0' }),
        ).not.toBe(key);
        expect(
            partialParseBaselineKey({ ...inputs, sandboxPath: '/usr/bin' }),
        ).not.toBe(key);
    });
});
