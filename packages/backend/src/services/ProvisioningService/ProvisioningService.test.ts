import {
    AlreadyExistsError,
    AuthorizationError,
    ForbiddenError,
    NotFoundError,
    ParameterError,
    TooManyRequestsError,
    type SessionUser,
} from '@lightdash/common';
import {
    createLocalJWKSet,
    exportJWK,
    generateKeyPair,
    SignJWT,
    type JWTVerifyGetKey,
    type KeyLike,
} from 'jose';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import type { LightdashConfig } from '../../config/parseConfig';
import type { EmailModel } from '../../models/EmailModel';
import type { ManagedSignInModel } from '../../models/ManagedSignInModel';
import type { OrganizationAllowedEmailDomainsModel } from '../../models/OrganizationAllowedEmailDomainsModel';
import type { UserModel } from '../../models/UserModel';
import type { OrganizationService } from '../OrganizationService/OrganizationService';
import { OidcTokenVerifier } from './oidcTokenVerifier';
import { ProvisioningService } from './ProvisioningService';

const ISSUER = 'https://issuer.example.com';
const AUDIENCE = 'https://lightdash.example.com/api/v1/provisioning';
const SUBJECT = '112233445566778899000';
const OWNER_DOMAIN = 'demo.example.com';
const OWNER_EMAIL = `acme-x7k2@${OWNER_DOMAIN}`;
const OWNER_PASSWORD = 'correct-horse-9!';
const REQUEST = {
    organizationName: 'Acme',
    ownerEmail: OWNER_EMAIL,
    ownerPassword: OWNER_PASSWORD,
};

const owner = {
    userId: 7,
    userUuid: 'user-uuid-1',
    organizationUuid: 'org-uuid-1',
    email: OWNER_EMAIL,
} as unknown as SessionUser;

let privateKey: KeyLike;
let otherPrivateKey: KeyLike;
let keySet: JWTVerifyGetKey;
let verifier: OidcTokenVerifier;

beforeAll(async () => {
    const pair = await generateKeyPair('RS256');
    privateKey = pair.privateKey;
    otherPrivateKey = (await generateKeyPair('RS256')).privateKey;
    keySet = createLocalJWKSet({
        keys: [{ ...(await exportJWK(pair.publicKey)), alg: 'RS256' }],
    });
    verifier = new OidcTokenVerifier({
        fetchOpenIdConfiguration: async (issuer) => ({
            issuer,
            jwks_uri: `${issuer}/keys`,
        }),
        createKeySet: () => keySet,
    });
});

type TokenOverrides = {
    iss: string;
    aud: string;
    sub: string;
    issuedSecondsAgo: number;
    signWithOtherKey: boolean;
};

const signToken = async (
    overrides: Partial<TokenOverrides> = {},
): Promise<string> => {
    const issuedAt =
        Math.floor(Date.now() / 1000) - (overrides.issuedSecondsAgo ?? 0);
    return new SignJWT({})
        .setProtectedHeader({ alg: 'RS256' })
        .setIssuer(overrides.iss ?? ISSUER)
        .setAudience(overrides.aud ?? AUDIENCE)
        .setSubject(overrides.sub ?? SUBJECT)
        .setIssuedAt(issuedAt)
        .setExpirationTime(issuedAt + 3600)
        .sign(overrides.signWithOtherKey ? otherPrivateKey : privateKey);
};

type ServiceOptions = {
    allowMultiOrgs: boolean;
    trustedProvisioner: LightdashConfig['auth']['trustedProvisioner'];
    ownerDomainAllowed: boolean;
};

const buildService = (options: Partial<ServiceOptions> = {}) => {
    const userModel = {
        createUser: vi.fn(async () => ({ userUuid: owner.userUuid })),
        findSessionUserByUUID: vi.fn(async () => owner),
        delete: vi.fn(async () => {}),
    };
    const emailModel = { verifyUserEmailIfExists: vi.fn(async () => []) };
    // Behaves like the table: the first claim of a hash wins.
    const usedTokens = new Set<string>();
    const managedSignInModel = {
        claimTokenUse: vi.fn(async (tokenHash: string) => {
            if (usedTokens.has(tokenHash)) return false;
            usedTokens.add(tokenHash);
            return true;
        }),
    };
    const organizationAllowedEmailDomainsModel = {
        isEmailDomainAllowedByAnyOrganization: vi.fn(
            async () => options.ownerDomainAllowed ?? false,
        ),
    };
    const organizationService = { createAndJoinOrg: vi.fn(async () => {}) };
    const service = new ProvisioningService({
        lightdashConfig: {
            ...lightdashConfigMock,
            allowMultiOrgs: options.allowMultiOrgs ?? true,
            auth: {
                ...lightdashConfigMock.auth,
                trustedProvisioner:
                    options.trustedProvisioner === undefined
                        ? {
                              issuer: ISSUER,
                              audience: AUDIENCE,
                              subjects: [SUBJECT],
                              ownerEmailDomain: OWNER_DOMAIN,
                          }
                        : options.trustedProvisioner,
            },
        },
        userModel: userModel as unknown as UserModel,
        emailModel: emailModel as unknown as EmailModel,
        managedSignInModel: managedSignInModel as unknown as ManagedSignInModel,
        organizationAllowedEmailDomainsModel:
            organizationAllowedEmailDomainsModel as unknown as OrganizationAllowedEmailDomainsModel,
        getOrganizationService: () =>
            organizationService as unknown as OrganizationService,
        verifier,
    });
    return {
        service,
        userModel,
        emailModel,
        managedSignInModel,
        organizationAllowedEmailDomainsModel,
        organizationService,
    };
};

describe('ProvisioningService', () => {
    it('creates the owner, then the organization, then verifies the email', async () => {
        const mocks = buildService();

        const result = await mocks.service.provisionOrganization(
            await signToken(),
            {
                organizationName: ' Acme ',
                ownerEmail: ' Acme-X7K2@Demo.Example.com',
                ownerPassword: OWNER_PASSWORD,
            },
        );

        expect(result).toEqual({
            organizationUuid: 'org-uuid-1',
            userUuid: 'user-uuid-1',
        });
        expect(mocks.userModel.createUser).toHaveBeenCalledWith(
            {
                firstName: 'Demo',
                lastName: 'Owner',
                email: OWNER_EMAIL,
                password: OWNER_PASSWORD,
            },
            true,
            true,
        );
        expect(mocks.organizationService.createAndJoinOrg).toHaveBeenCalledWith(
            owner,
            { name: 'Acme' },
        );
        expect(mocks.emailModel.verifyUserEmailIfExists).toHaveBeenCalledWith(
            'user-uuid-1',
            OWNER_EMAIL,
        );
        expect(
            mocks.organizationService.createAndJoinOrg.mock
                .invocationCallOrder[0],
        ).toBeLessThan(
            mocks.emailModel.verifyUserEmailIfExists.mock
                .invocationCallOrder[0],
        );
    });

    it('removes the owner and never verifies it when the organization fails', async () => {
        const mocks = buildService();
        mocks.organizationService.createAndJoinOrg.mockRejectedValue(
            new Error('database unavailable'),
        );

        await expect(
            mocks.service.provisionOrganization(await signToken(), REQUEST),
        ).rejects.toThrow('database unavailable');
        expect(mocks.userModel.delete).toHaveBeenCalledWith('user-uuid-1');
        expect(mocks.emailModel.verifyUserEmailIfExists).not.toHaveBeenCalled();
    });

    it('is not found when no trusted provisioner is configured', async () => {
        const { service, userModel } = buildService({
            trustedProvisioner: null,
        });

        await expect(
            service.provisionOrganization(await signToken(), REQUEST),
        ).rejects.toThrow(NotFoundError);
        expect(userModel.createUser).not.toHaveBeenCalled();
    });

    it('rejects a request without a token', async () => {
        const { service } = buildService();

        await expect(
            service.provisionOrganization(null, REQUEST),
        ).rejects.toThrow(AuthorizationError);
    });

    it.each<[string, Partial<TokenOverrides>]>([
        ['another audience', { aud: 'https://other.example.com' }],
        ['another issuer', { iss: 'https://other-issuer.example.com' }],
        ['an untrusted subject', { sub: '999' }],
        ['an unknown signing key', { signWithOtherKey: true }],
        ['a token issued too long ago', { issuedSecondsAgo: 600 }],
    ])('rejects a token with %s', async (_name, overrides) => {
        const { service, userModel, managedSignInModel } = buildService();

        await expect(
            service.provisionOrganization(await signToken(overrides), REQUEST),
        ).rejects.toThrow(AuthorizationError);
        expect(managedSignInModel.claimTokenUse).not.toHaveBeenCalled();
        expect(userModel.createUser).not.toHaveBeenCalled();
    });

    it.each([
        ['the same token', (token: string) => token],
        ['the token with padding added', (token: string) => `${token}=`],
        ['the token with a trailing character', (token: string) => `${token}!`],
    ])('accepts a token once and rejects %s after', async (_name, vary) => {
        const { service, userModel } = buildService();
        const token = await signToken();

        await service.provisionOrganization(token, REQUEST);
        await expect(
            service.provisionOrganization(vary(token), REQUEST),
        ).rejects.toThrow(AuthorizationError);
        expect(userModel.createUser).toHaveBeenCalledTimes(1);
    });

    it.each([
        'person@example.com',
        `acme@evil.${OWNER_DOMAIN}`,
        `acme@${OWNER_DOMAIN}.evil.com`,
        `acme@other.com@${OWNER_DOMAIN}`,
        `ac me@${OWNER_DOMAIN}`,
        `acmé@${OWNER_DOMAIN}`,
        `acme\n@${OWNER_DOMAIN}`,
        `@${OWNER_DOMAIN}`,
    ])('rejects the owner email %j', async (ownerEmail) => {
        const { service, userModel, managedSignInModel } = buildService();

        await expect(
            service.provisionOrganization(await signToken(), {
                ...REQUEST,
                ownerEmail,
            }),
        ).rejects.toThrow(ParameterError);
        expect(userModel.createUser).not.toHaveBeenCalled();
        // A bad request does not use up the token.
        expect(managedSignInModel.claimTokenUse).not.toHaveBeenCalled();
    });

    it.each(['  ', 'a\u0000b', '<script>'])(
        'rejects the organization name %j',
        async (organizationName) => {
            const { service, userModel } = buildService();

            await expect(
                service.provisionOrganization(await signToken(), {
                    ...REQUEST,
                    organizationName,
                }),
            ).rejects.toThrow(ParameterError);
            expect(userModel.createUser).not.toHaveBeenCalled();
        },
    );

    it('rejects a weak owner password', async () => {
        const { service, userModel } = buildService();

        await expect(
            service.provisionOrganization(await signToken(), {
                ...REQUEST,
                ownerPassword: 'short',
            }),
        ).rejects.toThrow(ParameterError);
        expect(userModel.createUser).not.toHaveBeenCalled();
    });

    it('refuses when the instance allows only one organization', async () => {
        const { service, userModel } = buildService({ allowMultiOrgs: false });

        await expect(
            service.provisionOrganization(await signToken(), REQUEST),
        ).rejects.toThrow(ForbiddenError);
        expect(userModel.createUser).not.toHaveBeenCalled();
    });

    it('refuses when an organization allows the owner email domain', async () => {
        const mocks = buildService({ ownerDomainAllowed: true });

        await expect(
            mocks.service.provisionOrganization(await signToken(), REQUEST),
        ).rejects.toThrow(ForbiddenError);
        expect(
            mocks.organizationAllowedEmailDomainsModel
                .isEmailDomainAllowedByAnyOrganization,
        ).toHaveBeenCalledWith(OWNER_DOMAIN);
        expect(mocks.userModel.createUser).not.toHaveBeenCalled();
    });

    it('reports a conflict when the owner already exists', async () => {
        const { service, userModel, organizationService } = buildService();
        userModel.createUser.mockRejectedValue(
            new AlreadyExistsError('Email already in use'),
        );

        await expect(
            service.provisionOrganization(await signToken(), REQUEST),
        ).rejects.toThrow(AlreadyExistsError);
        expect(organizationService.createAndJoinOrg).not.toHaveBeenCalled();
    });

    it('limits how many requests it handles in a minute', async () => {
        const { service } = buildService();
        const attempts = Array.from({ length: 30 }, () =>
            service.provisionOrganization(null, REQUEST).catch(() => null),
        );
        await Promise.all(attempts);

        await expect(
            service.provisionOrganization(await signToken(), REQUEST),
        ).rejects.toThrow(TooManyRequestsError);
    });
});

describe('OidcTokenVerifier', () => {
    const createKeySet = () => keySet;

    it.each([
        ['a different issuer', { issuer: 'https://evil.example.com' }],
        ['a key URL that is not https', { jwks_uri: 'http://keys.example' }],
        ['no key URL', { jwks_uri: undefined }],
    ])('rejects discovery that names %s', async (_name, overrides) => {
        const oidcVerifier = new OidcTokenVerifier({
            fetchOpenIdConfiguration: async (issuer) => ({
                issuer,
                jwks_uri: `${issuer}/keys`,
                ...overrides,
            }),
            createKeySet,
        });

        await expect(
            oidcVerifier.verify(await signToken(), ISSUER, AUDIENCE),
        ).rejects.toThrow('OpenID configuration does not describe the issuer');
    });

    it('rejects an issuer that is not https', async () => {
        const fetchConfiguration = vi.fn();
        const oidcVerifier = new OidcTokenVerifier({
            fetchOpenIdConfiguration: fetchConfiguration,
            createKeySet,
        });

        await expect(
            oidcVerifier.verify(
                await signToken(),
                'http://issuer.example.com',
                AUDIENCE,
            ),
        ).rejects.toThrow('issuer is not an https URL');
        expect(fetchConfiguration).not.toHaveBeenCalled();
    });

    it('looks the issuer up once for concurrent and later tokens', async () => {
        const fetchConfiguration = vi.fn(async (issuer: string) => ({
            issuer,
            jwks_uri: `${issuer}/keys`,
        }));
        const oidcVerifier = new OidcTokenVerifier({
            fetchOpenIdConfiguration: fetchConfiguration,
            createKeySet,
        });

        await Promise.all([
            oidcVerifier.verify(await signToken(), ISSUER, AUDIENCE),
            oidcVerifier.verify(await signToken(), ISSUER, AUDIENCE),
        ]);
        await oidcVerifier.verify(await signToken(), ISSUER, AUDIENCE);

        expect(fetchConfiguration).toHaveBeenCalledTimes(1);
    });

    it('does not repeat a failed lookup for every token', async () => {
        const fetchConfiguration = vi.fn(async () => {
            throw new Error('unreachable');
        });
        const oidcVerifier = new OidcTokenVerifier({
            fetchOpenIdConfiguration: fetchConfiguration,
            createKeySet,
        });

        await expect(
            oidcVerifier.verify(await signToken(), ISSUER, AUDIENCE),
        ).rejects.toThrow('unreachable');
        await expect(
            oidcVerifier.verify(await signToken(), ISSUER, AUDIENCE),
        ).rejects.toThrow('unreachable');

        expect(fetchConfiguration).toHaveBeenCalledTimes(1);
    });
});
