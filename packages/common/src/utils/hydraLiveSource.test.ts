import { ApiConnectorType } from '../types/querySources';
import {
    getHydraSettingsProblem,
    HYDRA_DEFAULT_SETTINGS,
    HYDRA_DEFAULT_SOURCE,
    HYDRA_SETTINGS_SCHEMA,
    withHydraDefaults,
} from './hydraLiveSource';

const hydra = (settings: Record<string, unknown> = {}) => ({
    connector: ApiConnectorType.HYDRA,
    ...settings,
});

describe('Hydra settings', () => {
    it('fills in every setting a source leaves out', () => {
        expect(withHydraDefaults(HYDRA_DEFAULT_SOURCE)).toEqual(
            HYDRA_DEFAULT_SETTINGS,
        );
        expect(
            withHydraDefaults({ ...HYDRA_DEFAULT_SOURCE, latencyMs: 500 }),
        ).toEqual({ ...HYDRA_DEFAULT_SETTINGS, latencyMs: 500 });
    });

    it('finds no problem with a source that sets nothing, or everything', () => {
        expect(getHydraSettingsProblem(HYDRA_DEFAULT_SOURCE)).toBeNull();
        expect(
            getHydraSettingsProblem(hydra({ ...HYDRA_DEFAULT_SETTINGS })),
        ).toBeNull();
    });

    it('reads a stored source saved in an older shape, defaulting what no longer fits', () => {
        const stored = hydra({
            latencyMs: 500,
            script: [],
            onLimit: { status: 429, retryAfter: 'seconds', body: null },
            sourceName: 'hydra',
            lastScan: { fields: [], scannedAt: '2026-11-23' },
        });
        expect(HYDRA_SETTINGS_SCHEMA.parse(stored)).toEqual(
            hydra({ latencyMs: 500 }),
        );
        // The API still refuses the same shape
        expect(getHydraSettingsProblem(stored)).not.toBeNull();
    });

    it.each([
        [
            { latencyMs: -1 },
            'latencyMs must be a whole number from 0 to 120000',
        ],
        [{ errorRate: 2 }, 'errorRate must be a number from 0 to 1'],
        [{ pageSize: 10_001 }, 'pageSize must be 0, or from 10 to 10000'],
        [{ failAuth: 'yes' }, 'failAuth must be true or false'],
        [{ speed: 1 }, 'speed is not a Hydra setting'],
        [
            {
                onLimit: { status: 200, retryAfterFormat: 'none' },
            },
            expect.stringMatching(/^onLimit\.status: /),
        ],
        [
            {
                mockResponses: [{ call: 1, fromCall: 2, status: 429 }],
            },
            'mockResponses.0 must set call, or fromCall',
        ],
        [
            { mockResponses: [{ call: 1, status: 200, body: {} }] },
            'mockResponses.0 must not set retryAfterSeconds or body with status 200',
        ],
        [
            { mockResponses: [{ fromCall: 3, toCall: 2, status: 503 }] },
            'mockResponses.0 must not set toCall before fromCall',
        ],
    ])('names the field and what it allows for %o', (settings, problem) => {
        expect(getHydraSettingsProblem(hydra(settings))).toEqual(problem);
    });

    describe('sign-in settings', () => {
        it('accepts revoked people, scopes per person and a declining consent screen', () => {
            expect(
                getHydraSettingsProblem(
                    hydra({
                        tokenTtlSeconds: 60,
                        revokedViewers: ['alice@example.com'],
                        viewerScopes: {
                            'bob@example.com': ['events:read', 'revenue:read'],
                        },
                        denyConsent: true,
                    }),
                ),
            ).toBeNull();
        });

        it.each([
            [{ tokenTtlSeconds: 0 }, expect.stringMatching(/^tokenTtlSeconds/)],
            [
                { revokedViewers: [''] },
                expect.stringMatching(/^revokedViewers/),
            ],
            [
                { viewerScopes: { 'bob@example.com': ['admin'] } },
                expect.stringMatching(/^viewerScopes/),
            ],
            [
                {
                    viewerScopes: Object.fromEntries(
                        Array.from({ length: 51 }, (_, index) => [
                            `person-${index}@example.com`,
                            [],
                        ]),
                    ),
                },
                expect.stringMatching(/^viewerScopes/),
            ],
            [{ denyConsent: 'yes' }, 'denyConsent must be true or false'],
        ])('refuses %#', (settings, problem) => {
            expect(getHydraSettingsProblem(hydra(settings))).toEqual(problem);
        });
    });

    describe('caps what one call does', () => {
        const bucket = (id: string) => ({ id, windowMs: 60_000, capacity: 1 });
        const limits = (buckets: unknown[]) => ({
            vendorLimits: {
                concurrentCalls: null,
                callsPerSecond: null,
                buckets,
            },
        });

        it.each([
            [
                limits(['a', 'b', 'c', 'd', 'e', 'f'].map(bucket)),
                'vendorLimits.buckets must have at most 5 entries',
            ],
            [
                limits([bucket('a'), bucket('a')]),
                'vendorLimits.buckets must have unique ids',
            ],
            [
                limits([bucket('second')]),
                'vendorLimits.buckets.0.id must not be second',
            ],
            [
                limits([bucket('x'.repeat(41))]),
                expect.stringMatching(/^vendorLimits\.buckets\.0\.id: /),
            ],
            [
                {
                    mockResponses: Array.from({ length: 51 }, (_, index) => ({
                        call: index + 1,
                        status: 503,
                    })),
                },
                'mockResponses must have at most 50 entries',
            ],
        ])('refuses %#', (settings, problem) => {
            expect(getHydraSettingsProblem(hydra(settings))).toEqual(problem);
        });
    });
});
