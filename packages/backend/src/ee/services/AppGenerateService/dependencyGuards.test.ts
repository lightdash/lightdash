import { ParameterError } from '@lightdash/common';
import {
    assertDependenciesMeetMinReleaseAge,
    registryPackumentUrl,
    type RegistryFetch,
} from './dependencyGuards';

const NOW = new Date('2026-07-10T00:00:00.000Z').getTime();
const DAY = 24 * 60 * 60 * 1000;

const packumentFetch =
    (times: Record<string, Record<string, string>>): RegistryFetch =>
    async (url) => {
        // last path segment, decoding the %2F used for scoped names
        const name = decodeURIComponent(url.split('/').pop() ?? '').replace(
            '%2F',
            '/',
        );
        const time = times[name];
        if (!time)
            return { status: 404, bodyText: 'not found', truncated: false };
        return {
            status: 200,
            bodyText: JSON.stringify({ time }),
            truncated: false,
        };
    };

describe('registryPackumentUrl', () => {
    it('builds a plain package url', () => {
        expect(registryPackumentUrl('registry.npmjs.org', 'deck.gl')).toBe(
            'https://registry.npmjs.org/deck.gl',
        );
    });
    it('percent-encodes the slash in a scoped name', () => {
        expect(registryPackumentUrl('registry.npmjs.org', '@scope/pkg')).toBe(
            'https://registry.npmjs.org/@scope%2Fpkg',
        );
    });
});

describe('assertDependenciesMeetMinReleaseAge', () => {
    const base = {
        registryHost: 'registry.npmjs.org',
        now: NOW,
    };

    it('is a no-op when the minimum age is 0 (disabled)', async () => {
        const fetchImpl = vi.fn();
        await assertDependenciesMeetMinReleaseAge({
            ...base,
            minReleaseAgeDays: 0,
            packages: [{ name: 'deck.gl', version: '9.3.5' }],
            fetchImpl: fetchImpl as unknown as RegistryFetch,
        });
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    it('is a no-op when there are no packages', async () => {
        const fetchImpl = vi.fn();
        await assertDependenciesMeetMinReleaseAge({
            ...base,
            minReleaseAgeDays: 7,
            packages: [],
            fetchImpl: fetchImpl as unknown as RegistryFetch,
        });
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    it('accepts a version older than the minimum', async () => {
        await assertDependenciesMeetMinReleaseAge({
            ...base,
            minReleaseAgeDays: 7,
            packages: [{ name: 'deck.gl', version: '9.3.5' }],
            fetchImpl: packumentFetch({
                'deck.gl': {
                    '9.3.5': new Date(NOW - 30 * DAY).toISOString(),
                },
            }),
        });
    });

    it('rejects a version published more recently than the minimum', async () => {
        await expect(
            assertDependenciesMeetMinReleaseAge({
                ...base,
                minReleaseAgeDays: 7,
                packages: [{ name: 'deck.gl', version: '9.3.5' }],
                fetchImpl: packumentFetch({
                    'deck.gl': {
                        '9.3.5': new Date(NOW - 2 * DAY).toISOString(),
                    },
                }),
            }),
        ).rejects.toThrow(ParameterError);
    });

    it('fails closed when the registry has no publish date for the version', async () => {
        await expect(
            assertDependenciesMeetMinReleaseAge({
                ...base,
                minReleaseAgeDays: 7,
                packages: [{ name: 'deck.gl', version: '9.3.5' }],
                fetchImpl: packumentFetch({
                    'deck.gl': {
                        '9.0.0': new Date(NOW - 90 * DAY).toISOString(),
                    },
                }),
            }),
        ).rejects.toThrow(/publish date/i);
    });

    it('fails closed when the registry call errors', async () => {
        await expect(
            assertDependenciesMeetMinReleaseAge({
                ...base,
                minReleaseAgeDays: 7,
                packages: [{ name: 'deck.gl', version: '9.3.5' }],
                fetchImpl: async () => {
                    throw new Error('network down');
                },
            }),
        ).rejects.toThrow(/Could not verify the release age/i);
    });

    it('fails closed on a truncated registry response', async () => {
        await expect(
            assertDependenciesMeetMinReleaseAge({
                ...base,
                minReleaseAgeDays: 7,
                packages: [{ name: 'deck.gl', version: '9.3.5' }],
                fetchImpl: async () => ({
                    status: 200,
                    bodyText: '{"time":{}',
                    truncated: true,
                }),
            }),
        ).rejects.toThrow(/Could not verify the release age/i);
    });

    it('fetches each package name only once even with multiple versions', async () => {
        const fetchImpl = vi.fn(
            packumentFetch({
                'deck.gl': {
                    '9.3.5': new Date(NOW - 30 * DAY).toISOString(),
                    '9.3.4': new Date(NOW - 40 * DAY).toISOString(),
                },
            }),
        );
        await assertDependenciesMeetMinReleaseAge({
            ...base,
            minReleaseAgeDays: 7,
            packages: [
                { name: 'deck.gl', version: '9.3.5' },
                { name: 'deck.gl', version: '9.3.4' },
            ],
            fetchImpl: fetchImpl as unknown as RegistryFetch,
        });
        expect(fetchImpl).toHaveBeenCalledTimes(1);
    });
});
