import {
    getBigqueryWorkloadIdentityStsAudience,
    getBigqueryWorkloadIdentityTokenAudience,
    isBigqueryWorkloadIdentityAudience,
    isBigqueryWorkloadIdentityProvider,
} from './bigqueryWorkloadIdentity';

const provider =
    'projects/123456/locations/global/workloadIdentityPools/pool-id/providers/provider-id';

describe('BigQuery workload identity settings', () => {
    test.each([
        provider,
        'projects/0/locations/global/workloadIdentityPools/abcd/providers/1234',
        `projects/123/locations/global/workloadIdentityPools/${'a'.repeat(32)}/providers/${'b'.repeat(32)}`,
    ])('accepts provider %s', (value) => {
        expect(isBigqueryWorkloadIdentityProvider(value)).toBe(true);
    });

    test.each([
        '',
        `https://iam.googleapis.com/${provider}`,
        `${provider}\n`,
        `${provider}/extra`,
        provider.replace('123456', 'project-name'),
        provider.replace('global', 'us-east1'),
        provider.replace('pool-id', 'abc'),
        provider.replace('provider-id', 'a'.repeat(33)),
        provider.replace('pool-id', 'pool_id'),
        provider.replace('provider-id', 'Provider'),
        provider.replace('pool-id', '../pool'),
    ])('rejects provider %s', (value) => {
        expect(isBigqueryWorkloadIdentityProvider(value)).toBe(false);
    });

    test.each(['', 'with space', 'trailing\n', '\ttab', 'a'.repeat(257)])(
        'rejects audience %s',
        (value) => {
            expect(isBigqueryWorkloadIdentityAudience(value)).toBe(false);
        },
    );

    test('accepts a bounded audience and derives the default', () => {
        expect(isBigqueryWorkloadIdentityAudience('a'.repeat(256))).toBe(true);
        expect(
            getBigqueryWorkloadIdentityTokenAudience({
                workloadIdentityProvider: provider,
            }),
        ).toBe(`https://iam.googleapis.com/${provider}`);
        expect(
            getBigqueryWorkloadIdentityTokenAudience({
                workloadIdentityProvider: provider,
                workloadIdentityAudience: 'custom',
            }),
        ).toBe('custom');
        expect(
            getBigqueryWorkloadIdentityStsAudience({
                workloadIdentityProvider: provider,
            }),
        ).toBe(`//iam.googleapis.com/${provider}`);
    });
});
