import {
    AlreadyExistsError,
    AuthorizationError,
    ForbiddenError,
    NotFoundError,
    ParameterError,
    type SessionUser,
} from '@lightdash/common';
import {
    createLocalJWKSet,
    exportJWK,
    generateKeyPair,
    SignJWT,
    type KeyLike,
} from 'jose';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import type { LightdashConfig } from '../../config/parseConfig';
import type { EmailModel } from '../../models/EmailModel';
import type { ManagedSignInModel } from '../../models/ManagedSignInModel';
import type { UserModel } from '../../models/UserModel';
import type { OrganizationService } from '../OrganizationService/OrganizationService';
import type { PersonalAccessTokenService } from '../PersonalAccessTokenService';
import { OidcTokenVerifier } from './oidcTokenVerifier';
import { ProvisioningService } from './ProvisioningService';

const ISSUER = 'https://issuer.example.com';
const AUDIENCE = 'https://lightdash.example.com/api/v1/provisioning';
const SUBJECT = '112233445566778899000';
const OWNER_DOMAIN = 'demos.example.com';
const OWNER_EMAIL = `acme@${OWNER_DOMAIN}`;
const REQUEST = { organizationName: 'Acme', ownerEmail: OWNER_EMAIL };

const owner = {
    userId: 7,
    userUuid: 'user-uuid-1',
    organizationUuid: 'org-uuid-1',
    email: OWNER_EMAIL,
    abilityRules: [],
    ability: {},
} as unknown as SessionUser;

let privateKey: KeyLike;
let otherPrivateKey: KeyLike;
let verifier: OidcTokenVerifier;

beforeAll(async () => {
    const pair = await generateKeyPair('RS256');
    privateKey = pair.privateKey;
    otherPrivateKey = (await generateKeyPair('RS256')).privateKey;
    const keySet = createLocalJWKSet({
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

const buildService = (
    config: Partial<Pick<LightdashConfig, 'allowMultiOrgs'>> & {
        trustedProvisioner?: LightdashConfig['auth']['trustedProvisioner'];
    } = {},
) => {
    const userModel = {
        createUser: vi.fn(async () => ({ userUuid: owner.userUuid })),
        findSessionUserByUUID: vi.fn(async () => owner),
    };
    const emailModel = { verifyUserEmailIfExists: vi.fn(async () => []) };
    const managedSignInModel = { claimTokenUse: vi.fn(async () => true) };
    const organizationService = { createAndJoinOrg: vi.fn(async () => {}) };
    const personalAccessTokenService = {
        createPersonalAccessToken: vi.fn(async () => ({ token: 'ldpat_new' })),
    };
    const service = new ProvisioningService({
        lightdashConfig: {
            ...lightdashConfigMock,
            allowMultiOrgs: config.allowMultiOrgs ?? true,
            auth: {
                ...lightdashConfigMock.auth,
                trustedProvisioner:
                    config.trustedProvisioner === undefined
                        ? {
                              issuer: ISSUER,
                              audience: AUDIENCE,
                              subjects: [SUBJECT],
                              ownerEmailDomain: OWNER_DOMAIN,
                          }
                        : config.trustedProvisioner,
            },
        },
        userModel: userModel as unknown as UserModel,
        emailModel: emailModel as unknown as EmailModel,
        managedSignInModel: managedSignInModel as unknown as ManagedSignInModel,
        getOrganizationService: () =>
            organizationService as unknown as OrganizationService,
        getPersonalAccessTokenService: () =>
            personalAccessTokenService as unknown as PersonalAccessTokenService,
        verifier,
    });
    return {
        service,
        userModel,
        emailModel,
        managedSignInModel,
        organizationService,
        personalAccessTokenService,
    };
};

describe('ProvisioningService', () => {
    it('creates a verified owner, an organization and a token', async () => {
        const mocks = buildService();

        const result = await mocks.service.provisionOrganization(
            await signToken(),
            {
                organizationName: ' Acme ',
                ownerEmail: ' Acme@Demos.Example.com',
            },
        );

        expect(result).toMatchObject({
            organizationUuid: 'org-uuid-1',
            userUuid: 'user-uuid-1',
            token: 'ldpat_new',
        });
        expect(mocks.userModel.createUser).toHaveBeenCalledWith(
            { firstName: 'Demo', lastName: 'Owner', email: OWNER_EMAIL },
            true,
            true,
        );
        expect(mocks.emailModel.verifyUserEmailIfExists).toHaveBeenCalledWith(
            'user-uuid-1',
            OWNER_EMAIL,
        );
        expect(mocks.organizationService.createAndJoinOrg).toHaveBeenCalledWith(
            owner,
            { name: 'Acme' },
        );
        const [account, tokenRequest] = mocks.personalAccessTokenService
            .createPersonalAccessToken.mock.calls[0] as unknown as [
            { user: { userUuid: string } },
            { expiresAt: Date },
        ];
        expect(account.user.userUuid).toBe('user-uuid-1');
        expect(tokenRequest.expiresAt).toEqual(result.tokenExpiresAt);
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

    it('rejects a token that was already used', async () => {
        const { service, userModel, managedSignInModel } = buildService();
        managedSignInModel.claimTokenUse.mockResolvedValue(false);

        await expect(
            service.provisionOrganization(await signToken(), REQUEST),
        ).rejects.toThrow(AuthorizationError);
        expect(userModel.createUser).not.toHaveBeenCalled();
    });

    it.each([
        'person@example.com',
        `acme@evil.${OWNER_DOMAIN}`,
        `acme@${OWNER_DOMAIN}.evil.com`,
        `someone@example.com@${OWNER_DOMAIN}`,
        `@${OWNER_DOMAIN}`,
    ])('rejects the owner email %s', async (ownerEmail) => {
        const { service, userModel } = buildService();

        await expect(
            service.provisionOrganization(await signToken(), {
                organizationName: 'Acme',
                ownerEmail,
            }),
        ).rejects.toThrow(ParameterError);
        expect(userModel.createUser).not.toHaveBeenCalled();
    });

    it('rejects an empty organization name', async () => {
        const { service } = buildService();

        await expect(
            service.provisionOrganization(await signToken(), {
                organizationName: '  ',
                ownerEmail: OWNER_EMAIL,
            }),
        ).rejects.toThrow(ParameterError);
    });

    it('refuses when the instance allows only one organization', async () => {
        const { service, userModel } = buildService({ allowMultiOrgs: false });

        await expect(
            service.provisionOrganization(await signToken(), REQUEST),
        ).rejects.toThrow(ForbiddenError);
        expect(userModel.createUser).not.toHaveBeenCalled();
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
});

describe('OidcTokenVerifier', () => {
    const createKeySet = () => createLocalJWKSet({ keys: [] });

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
});
