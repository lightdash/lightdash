import { ParameterError } from '@lightdash/common';
import {
    assertDependenciesHaveNoKnownMalware,
    assertDependenciesMeetMinReleaseAge,
    registryPackumentUrl,
    type OsvBatchFetch,
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

describe('assertDependenciesHaveNoKnownMalware', () => {
    const okResponse =
        (count: number): OsvBatchFetch =>
        async () => ({
            status: 200,
            bodyText: JSON.stringify({
                results: Array.from({ length: count }, () => ({})),
            }),
            truncated: false,
        });

    it('is a no-op when disabled', async () => {
        const fetchImpl = vi.fn();
        await assertDependenciesHaveNoKnownMalware({
            enabled: false,
            packages: [{ name: 'deck.gl', version: '9.3.5' }],
            fetchImpl: fetchImpl as unknown as OsvBatchFetch,
        });
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    it('is a no-op when there are no packages', async () => {
        const fetchImpl = vi.fn();
        await assertDependenciesHaveNoKnownMalware({
            enabled: true,
            packages: [],
            fetchImpl: fetchImpl as unknown as OsvBatchFetch,
        });
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    it('accepts packages with no malicious advisories', async () => {
        await assertDependenciesHaveNoKnownMalware({
            enabled: true,
            packages: [
                { name: 'deck.gl', version: '9.3.5' },
                { name: 'react', version: '19.0.0' },
            ],
            fetchImpl: okResponse(2),
        });
    });

    it('ignores non-malware advisories (e.g. a plain CVE)', async () => {
        await assertDependenciesHaveNoKnownMalware({
            enabled: true,
            packages: [{ name: 'lodash', version: '4.17.20' }],
            fetchImpl: async () => ({
                status: 200,
                bodyText: JSON.stringify({
                    results: [{ vulns: [{ id: 'GHSA-xxxx-yyyy-zzzz' }] }],
                }),
                truncated: false,
            }),
        });
    });

    it('rejects a package flagged MAL- by OSV, naming it', async () => {
        await expect(
            assertDependenciesHaveNoKnownMalware({
                enabled: true,
                packages: [
                    { name: 'good-pkg', version: '1.0.0' },
                    { name: 'evil-pkg', version: '6.6.6' },
                ],
                fetchImpl: async () => ({
                    status: 200,
                    bodyText: JSON.stringify({
                        results: [{}, { vulns: [{ id: 'MAL-2026-0001' }] }],
                    }),
                    truncated: false,
                }),
            }),
        ).rejects.toThrow(/evil-pkg@6\.6\.6/);
    });

    it('fails closed when OSV is unreachable', async () => {
        await expect(
            assertDependenciesHaveNoKnownMalware({
                enabled: true,
                packages: [{ name: 'deck.gl', version: '9.3.5' }],
                fetchImpl: async () => {
                    throw new Error('network down');
                },
            }),
        ).rejects.toThrow(ParameterError);
    });

    it('fails closed on a truncated OSV response', async () => {
        await expect(
            assertDependenciesHaveNoKnownMalware({
                enabled: true,
                packages: [{ name: 'deck.gl', version: '9.3.5' }],
                fetchImpl: async () => ({
                    status: 200,
                    bodyText: '{"results":[',
                    truncated: true,
                }),
            }),
        ).rejects.toThrow(/malware feed/i);
    });

    it('fails closed when OSV returns fewer results than queries', async () => {
        await expect(
            assertDependenciesHaveNoKnownMalware({
                enabled: true,
                packages: [
                    { name: 'a', version: '1.0.0' },
                    { name: 'b', version: '2.0.0' },
                ],
                // One result for two queries — the tail package would go
                // unscreened if the length weren't guarded.
                fetchImpl: async () => ({
                    status: 200,
                    bodyText: JSON.stringify({ results: [{}] }),
                    truncated: false,
                }),
            }),
        ).rejects.toThrow(/malware feed/i);
    });
});
