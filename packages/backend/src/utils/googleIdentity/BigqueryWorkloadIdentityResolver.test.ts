import {
    BigqueryAuthenticationType,
    getBigqueryWorkloadIdentityStsAudience,
    getBigqueryWorkloadIdentityTokenAudience,
    ParameterError,
    WarehouseConnectionError,
    WarehouseTypes,
    type CreateBigqueryCredentials,
} from '@lightdash/common';
import Logger from '../../logging/logger';
import { BigqueryWorkloadIdentityResolver } from './BigqueryWorkloadIdentityResolver';
import { GOOGLE_IDENTITY_TOKEN_UNAVAILABLE } from './googleIdentityTokenSource';

const provider =
    'projects/123456/locations/global/workloadIdentityPools/pool-id/providers/provider-id';
const credentials: CreateBigqueryCredentials = {
    type: WarehouseTypes.BIGQUERY,
    project: 'project',
    dataset: 'dataset',
    authenticationType: BigqueryAuthenticationType.WORKLOAD_IDENTITY_FEDERATION,
    workloadIdentityProvider: provider,
    keyfileContents: {},
    timeoutSeconds: undefined,
    priority: undefined,
    retries: undefined,
    location: undefined,
    maximumBytesBilled: undefined,
};

const tokenFor = (expiresAt: number) =>
    `header.${Buffer.from(JSON.stringify({ sub: '123456789', exp: expiresAt / 1000 })).toString('base64url')}.signature`;
const build = () => {
    const isEnabledFor = vi.fn(
        async (organizationUuid: string) => organizationUuid === 'org',
    );
    const getIdToken = vi.fn(async () => tokenFor(Date.now() + 3_600_000));
    const resolver = new BigqueryWorkloadIdentityResolver({
        isEnabledFor,
        tokenSource: { getIdToken },
    });
    return { resolver, getIdToken, isEnabledFor };
};

describe('BigqueryWorkloadIdentityResolver', () => {
    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    test('refuses writes and queries for a disabled or missing organization', async () => {
        const { resolver, getIdToken } = build();
        await expect(
            resolver.assertAllowedFor(credentials, 'other-org'),
        ).rejects.toThrow(ParameterError);
        await expect(
            resolver.getExternalAccountCredentials(credentials, 'other-org'),
        ).rejects.toThrow(WarehouseConnectionError);
        await expect(
            resolver.getExternalAccountCredentials(credentials, undefined),
        ).rejects.toThrow(
            new WarehouseConnectionError(
                'An organization is required to use BigQuery workload identity federation.',
            ),
        );
        expect(getIdToken).not.toHaveBeenCalled();
    });

    test.each([
        undefined,
        '',
        'https://attacker.example/provider',
        `${provider}\n`,
    ])(
        'rejects provider %s on write and read',
        async (workloadIdentityProvider) => {
            const { resolver } = build();
            const invalid = { ...credentials, workloadIdentityProvider };
            await expect(
                resolver.assertAllowedFor(invalid, 'org'),
            ).rejects.toThrow(ParameterError);
            await expect(
                resolver.getExternalAccountCredentials(invalid, 'org'),
            ).rejects.toThrow(WarehouseConnectionError);
        },
    );

    test.each(['', 'has whitespace', 'a'.repeat(257)])(
        'rejects audience %s',
        async (workloadIdentityAudience) => {
            await expect(
                build().resolver.assertAllowedFor(
                    { ...credentials, workloadIdentityAudience },
                    'org',
                ),
            ).rejects.toThrow(ParameterError);
        },
    );

    test.each([undefined, 'custom-audience'])(
        'uses the correct JWT and STS audiences: %s',
        async (workloadIdentityAudience) => {
            const { resolver, getIdToken } = build();
            const connection = { ...credentials, workloadIdentityAudience };
            const external = await resolver.getExternalAccountCredentials(
                connection,
                'org',
            );
            expect(external).toEqual({
                type: 'external_account',
                audience: getBigqueryWorkloadIdentityStsAudience(connection),
                subject_token_type: 'urn:ietf:params:oauth:token-type:jwt',
                token_url: 'https://sts.googleapis.com/v1/token',
                subject_token_supplier: {
                    getSubjectToken: expect.any(Function),
                },
            });
            await external?.subject_token_supplier.getSubjectToken();
            expect(getIdToken).toHaveBeenCalledExactlyOnceWith(
                getBigqueryWorkloadIdentityTokenAudience(connection),
            );
        },
    );

    test('caches tokens, coalesces concurrent requests, and refreshes before expiry', async () => {
        vi.useFakeTimers();
        const { resolver, getIdToken } = build();
        const external = await resolver.getExternalAccountCredentials(
            credentials,
            'org',
        );
        const getToken = () =>
            external?.subject_token_supplier.getSubjectToken();
        const [first, concurrent] = await Promise.all([getToken(), getToken()]);
        expect(concurrent).toBe(first);
        expect(await getToken()).toBe(first);
        expect(getIdToken).toHaveBeenCalledTimes(1);
        vi.advanceTimersByTime(3_299_999);
        expect(await getToken()).toBe(first);
        expect(getIdToken).toHaveBeenCalledTimes(1);
        vi.advanceTimersByTime(1);
        expect(await getToken()).not.toBe(first);
        expect(getIdToken).toHaveBeenCalledTimes(2);
        vi.advanceTimersByTime(3_600_000);
        await getToken();
        expect(getIdToken).toHaveBeenCalledTimes(3);
    });

    test('hides token-source failures and retries after a failed request', async () => {
        const { resolver, getIdToken } = build();
        const external = await resolver.getExternalAccountCredentials(
            credentials,
            'org',
        );
        getIdToken.mockRejectedValueOnce(new Error('secret-token-value'));
        await expect(
            external?.subject_token_supplier.getSubjectToken(),
        ).rejects.toThrow(
            new WarehouseConnectionError(GOOGLE_IDENTITY_TOKEN_UNAVAILABLE),
        );
        await expect(
            external?.subject_token_supplier.getSubjectToken(),
        ).resolves.toBeTypeOf('string');
        expect(getIdToken).toHaveBeenCalledTimes(2);
    });

    test.each(['not-a-token', tokenFor(0)])(
        'rejects invalid or expired metadata tokens',
        async (token) => {
            const warn = vi
                .spyOn(Logger, 'warn')
                .mockImplementation(() => Logger);
            const { resolver, getIdToken } = build();
            getIdToken.mockResolvedValue(token);
            const external = await resolver.getExternalAccountCredentials(
                credentials,
                'org',
            );
            await expect(
                external?.subject_token_supplier.getSubjectToken(),
            ).rejects.toThrow(GOOGLE_IDENTITY_TOKEN_UNAVAILABLE);
            expect(warn).toHaveBeenCalledExactlyOnceWith(
                'The GCP metadata server returned an unusable identity token',
            );
        },
    );

    test('rechecks enablement on the existing supplier without restarting', async () => {
        const { resolver, isEnabledFor } = build();
        const external = await resolver.getExternalAccountCredentials(
            credentials,
            'org',
        );
        await external?.subject_token_supplier.getSubjectToken();
        isEnabledFor.mockResolvedValue(false);
        await expect(
            external?.subject_token_supplier.getSubjectToken(),
        ).rejects.toThrow(WarehouseConnectionError);
        isEnabledFor.mockResolvedValue(true);
        await expect(
            external?.subject_token_supplier.getSubjectToken(),
        ).resolves.toBeTypeOf('string');
    });

    test.each([
        BigqueryAuthenticationType.ADC,
        BigqueryAuthenticationType.PRIVATE_KEY,
        BigqueryAuthenticationType.SSO,
        undefined,
    ])('leaves %s authentication untouched', async (authenticationType) => {
        const { resolver, isEnabledFor } = build();
        const other = { ...credentials, authenticationType };
        await expect(
            resolver.assertAllowedFor(other, 'other-org'),
        ).resolves.toBeUndefined();
        await expect(
            resolver.getExternalAccountCredentials(other, 'other-org'),
        ).resolves.toBeUndefined();
        expect(isEnabledFor).not.toHaveBeenCalled();
    });
});
