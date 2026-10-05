import {
    AthenaAuthenticationType,
    ParameterError,
    WarehouseConnectionError,
    WarehouseTypes,
    type CreateAthenaCredentials,
} from '@lightdash/common';
import { type AwsWebIdentityAudienceModel } from '../../models/AwsWebIdentityAudienceModel';
import { AwsWebIdentityResolver } from './AwsWebIdentityResolver';
import {
    GcpMetadataIdentityTokenSource,
    type GoogleIdentityTokenSource,
} from './googleIdentityTokenSource';

const { mockFromWebToken } = vi.hoisted(() => ({
    mockFromWebToken: vi.fn(),
}));
vi.mock('@aws-sdk/credential-providers', () => ({
    fromWebToken: mockFromWebToken,
}));

const ORG_A = '00000000-0000-4000-8000-00000000000a';
const ORG_B = '00000000-0000-4000-8000-00000000000b';
const ROLE = 'arn:aws:iam::123456789012:role/lightdash';
const SUBJECT = '111429504119237381932';

const credentials: CreateAthenaCredentials = {
    type: WarehouseTypes.ATHENA,
    region: 'eu-west-1',
    database: 'AwsDataCatalog',
    schema: 'analytics',
    s3StagingDir: 's3://bucket/results/',
    authenticationType: AthenaAuthenticationType.WEB_IDENTITY,
    assumeRoleArn: ROLE,
    webIdentityAudience: 'lightdash-audience-a',
};

const tokenFor = (sub: string) =>
    `header.${Buffer.from(JSON.stringify({ sub })).toString('base64url')}.sig`;

const build = ({
    enabled = true,
    tokenSource,
}: {
    enabled?: boolean;
    tokenSource?: GoogleIdentityTokenSource;
} = {}) => {
    const getOrganizationUuid = vi.fn(async (audience: string) =>
        audience === 'lightdash-audience-a' ? ORG_A : null,
    );
    const getIdToken = vi.fn(async () => tokenFor(SUBJECT));
    const isEnabledFor = vi.fn(async (_organizationUuid: string) => enabled);
    const resolver = new AwsWebIdentityResolver({
        isEnabledFor,
        audienceModel: {
            getOrganizationUuid,
        } as unknown as AwsWebIdentityAudienceModel,
        tokenSource: tokenSource ?? { getIdToken },
    });
    return { resolver, getOrganizationUuid, getIdToken, isEnabledFor };
};

const accessDenied = () => {
    const e = new Error('Not authorized');
    e.name = 'AccessDenied';
    return e;
};

describe('AwsWebIdentityResolver', () => {
    beforeEach(() => {
        mockFromWebToken.mockReset();
        mockFromWebToken.mockReturnValue(async () => ({
            accessKeyId: 'ASIA',
            secretAccessKey: 'SECRET',
        }));
    });

    describe('resolveCredentials', () => {
        test("assumes the role with a token for the organization's audience", async () => {
            const { resolver, getIdToken } = build();
            const provider = await resolver.resolveCredentials(
                credentials,
                ORG_A,
            );

            await expect(provider!()).resolves.toEqual({
                accessKeyId: 'ASIA',
                secretAccessKey: 'SECRET',
            });
            expect(getIdToken).toHaveBeenCalledWith('lightdash-audience-a');
            expect(mockFromWebToken).toHaveBeenCalledWith({
                roleArn: ROLE,
                webIdentityToken: tokenFor(SUBJECT),
                roleSessionName: `lightdash-${ORG_A}`,
                clientConfig: { region: 'eu-west-1' },
            });
        });

        test.each([
            ["another organization's audience", credentials, ORG_B],
            [
                'an audience Lightdash did not generate',
                { ...credentials, webIdentityAudience: 'made-up' },
                ORG_A,
            ],
            [
                'a missing audience',
                { ...credentials, webIdentityAudience: undefined },
                ORG_A,
            ],
            ['an unknown owning organization', credentials, undefined],
        ])('refuses %s', async (_, creds, org) => {
            const { resolver, getIdToken } = build();
            const provider = await resolver.resolveCredentials(creds, org);

            await expect(provider!()).rejects.toThrow(WarehouseConnectionError);
            expect(getIdToken).not.toHaveBeenCalled();
            expect(mockFromWebToken).not.toHaveBeenCalled();
        });

        test("refuses everything when the connection's organization hasn't enabled it", async () => {
            const { resolver, getOrganizationUuid, isEnabledFor } = build({
                enabled: false,
            });
            const provider = await resolver.resolveCredentials(
                credentials,
                ORG_A,
            );

            await expect(provider!()).rejects.toThrow(/isn't turned on/);
            expect(isEnabledFor).toHaveBeenCalledWith(ORG_A);
            expect(getOrganizationUuid).not.toHaveBeenCalled();
        });

        test('returns nothing for other authentication types', async () => {
            const { resolver } = build();
            await expect(
                resolver.resolveCredentials(
                    {
                        ...credentials,
                        authenticationType: AthenaAuthenticationType.ACCESS_KEY,
                    },
                    ORG_A,
                ),
            ).resolves.toBeUndefined();
        });

        test('names the subject and audience when AWS denies the role', async () => {
            mockFromWebToken.mockReturnValue(async () => {
                throw accessDenied();
            });
            const { resolver } = build();
            const provider = await resolver.resolveCredentials(
                credentials,
                ORG_A,
            );

            await expect(provider!()).rejects.toThrow(
                `subject ${SUBJECT} and audience lightdash-audience-a`,
            );
        });
    });

    describe('assertAudienceBelongsTo', () => {
        test('accepts the organization that generated the audience', async () => {
            await expect(
                build().resolver.assertAudienceBelongsTo(credentials, ORG_A),
            ).resolves.toBeUndefined();
        });

        test("rejects another organization's audience", async () => {
            await expect(
                build().resolver.assertAudienceBelongsTo(credentials, ORG_B),
            ).rejects.toThrow(ParameterError);
        });
    });

    describe('assertRoleRequiresAudience', () => {
        test('rejects a role that accepts an unregistered audience', async () => {
            const { resolver, getIdToken } = build();

            await expect(
                resolver.assertRoleRequiresAudience(credentials),
            ).rejects.toThrow(/doesn't require accounts.google.com:oaud/);
            expect(getIdToken).toHaveBeenCalledWith(
                expect.stringMatching(/^lightdash-probe-[0-9a-f]{32}$/),
            );
        });

        test('accepts a role that refuses an unregistered audience', async () => {
            mockFromWebToken.mockReturnValue(async () => {
                throw accessDenied();
            });

            await expect(
                build().resolver.assertRoleRequiresAudience(credentials),
            ).resolves.toBeUndefined();
        });
    });

    describe('getSubject', () => {
        test('reads and caches the subject of the instance identity', async () => {
            const { resolver, getIdToken } = build();

            await expect(resolver.getSubject()).resolves.toBe(SUBJECT);
            await expect(resolver.getSubject()).resolves.toBe(SUBJECT);
            expect(getIdToken).toHaveBeenCalledTimes(1);
        });

        test('returns undefined off Google Cloud', async () => {
            const { resolver } = build({
                tokenSource: {
                    getIdToken: async () => {
                        throw new Error('unreachable');
                    },
                },
            });

            await expect(resolver.getSubject()).resolves.toBeUndefined();
        });
    });
});

describe('GcpMetadataIdentityTokenSource', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    test('requests a token for the audience from the metadata server', async () => {
        const fetchMock = vi.fn(async () => ({
            ok: true,
            text: async () => 'token',
        }));
        vi.stubGlobal('fetch', fetchMock);

        await expect(
            new GcpMetadataIdentityTokenSource().getIdToken('lightdash-a'),
        ).resolves.toBe('token');
        expect(fetchMock).toHaveBeenCalledWith(
            expect.stringContaining('audience=lightdash-a&format=full'),
            expect.objectContaining({
                headers: { 'Metadata-Flavor': 'Google' },
            }),
        );
    });

    test('hides the raw error when the metadata server is unreachable', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => {
                throw new Error('getaddrinfo ENOTFOUND');
            }),
        );

        await expect(
            new GcpMetadataIdentityTokenSource().getIdToken('lightdash-a'),
        ).rejects.toThrow(
            "Lightdash couldn't get its identity token. This is on our side, not your AWS setup. Try again, or contact support.",
        );
    });
});
