import {
    MOBILE_SETUP_CODE_GRANT_TYPE,
    MobileSetupCodeError,
    type SessionUser,
} from '@lightdash/common';
import OAuth2Server from '@node-oauth/oauth2-server';
import { type Knex } from 'knex';
import { type OAuth2Model } from '../../models/OAuth2Model';
import { MobileSetupRejection } from '../MobileSetupService/MobileSetupRejection';
import type { MobileSetupService } from '../MobileSetupService/MobileSetupService';
import { createMobileSetupCodeGrantType } from './mobileSetupCodeGrantType';

const user = { userId: 7, organizationUuid: 'org-uuid' } as SessionUser & {
    organizationUuid: string;
};
const client: OAuth2Server.Client = {
    id: 'mobile-client',
    grants: [MOBILE_SETUP_CODE_GRANT_TYPE],
    redirectUris: ['com.lightdash.mobile://oauth/callback'],
    isPublicClient: true,
};
const projectUuid = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const validBody = {
    grant_type: MOBILE_SETUP_CODE_GRANT_TYPE,
    code: 'A'.repeat(32),
    platform: 'ios',
    scope: 'read write',
};
const createRequest = (
    body: Omit<typeof validBody, 'scope'> & { scope?: string } = validBody,
) =>
    new OAuth2Server.Request({
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        query: {},
        body,
    });

const transaction = { isTransaction: true } as Knex.Transaction;

const createGrant = () => {
    const service = {
        redeem: vi
            .fn<MobileSetupService['redeem']>()
            .mockImplementation(async (_request, issueTokens) =>
                issueTokens({ user, projectUuid }, transaction),
            ),
    } as unknown as MobileSetupService;
    const model = {
        saveToken: vi
            .fn<OAuth2Model['saveToken']>()
            .mockImplementation(async (token, tokenClient, tokenUser) => ({
                ...token,
                client: tokenClient,
                user: tokenUser,
            })),
    } as unknown as OAuth2Model;
    const GrantType = createMobileSetupCodeGrantType(() => service);
    const grant = new GrantType({
        model,
        accessTokenLifetime: 3600,
        refreshTokenLifetime: 7200,
    } as OAuth2Server.TokenOptions);
    return { service, model, grant, GrantType };
};

describe('mobile setup code grant', () => {
    it('issues access and refresh tokens with the bound user and project', async () => {
        const { grant, service, model } = createGrant();
        const token = await grant.handle(createRequest(), client);
        expect(vi.mocked(service.redeem)).toHaveBeenCalledWith(
            {
                code: validBody.code,
                client,
                platform: 'ios',
            },
            expect.any(Function),
        );
        expect(token.accessToken).toBeTruthy();
        expect(token.refreshToken).toBeTruthy();
        expect(token.lightdash_project_uuid).toBe(projectUuid);
        expect(vi.mocked(model.saveToken)).toHaveBeenCalledWith(
            expect.objectContaining({
                scope: ['read', 'write'],
                lightdash_project_uuid: projectUuid,
            }),
            client,
            user,
            { trx: transaction },
        );
    });

    it.each(Object.values(MobileSetupCodeError))(
        'returns invalid_grant for %s without issuing tokens',
        async (code) => {
            const { grant, service, model } = createGrant();
            vi.mocked(service.redeem).mockRejectedValue(
                new MobileSetupRejection(code),
            );
            await expect(
                grant.handle(createRequest(), client),
            ).rejects.toMatchObject({ name: 'invalid_grant', message: code });
            expect(vi.mocked(model.saveToken)).not.toHaveBeenCalled();
        },
    );

    it('maps a rejected client kind to unknown', async () => {
        const { grant, service, model } = createGrant();
        vi.mocked(service.redeem).mockRejectedValue(
            new MobileSetupRejection(MobileSetupCodeError.UNKNOWN),
        );
        await expect(
            grant.handle(createRequest(), { ...client, isPublicClient: false }),
        ).rejects.toMatchObject({ name: 'invalid_grant', message: 'unknown' });
        expect(vi.mocked(model.saveToken)).not.toHaveBeenCalled();
    });

    it.each([
        ['read write admin mcp:write', ['read', 'write']],
        ['read', ['read']],
    ])('clamps requested scope %s', async (requested, expected) => {
        const { grant } = createGrant();
        const token = await grant.handle(
            createRequest({ ...validBody, scope: requested as string }),
            client,
        );
        expect(token.scope).toEqual(expected);
    });

    it('defaults to read write when the scope parameter is omitted', async () => {
        const { grant } = createGrant();
        const token = await grant.handle(
            createRequest({
                grant_type: validBody.grant_type,
                code: validBody.code,
                platform: validBody.platform,
            }),
            client,
        );
        expect(token.scope).toEqual(['read', 'write']);
    });

    it.each(['admin', 'unknown', ''])(
        'rejects scope %s before consuming the code',
        async (scope) => {
            const { grant, service, model } = createGrant();
            await expect(
                grant.handle(createRequest({ ...validBody, scope }), client),
            ).rejects.toMatchObject({ name: 'invalid_scope' });
            expect(vi.mocked(service.redeem)).not.toHaveBeenCalled();
            expect(vi.mocked(model.saveToken)).not.toHaveBeenCalled();
        },
    );

    it('keeps the project UUID in the library extended token response', async () => {
        const { model, GrantType } = createGrant();
        const server = new OAuth2Server({
            model: {
                saveToken: model.saveToken,
                getClient: vi.fn().mockResolvedValue(client),
                getAccessToken: vi
                    .fn<OAuth2Model['getAccessToken']>()
                    .mockResolvedValue(false),
            },
            extendedGrantTypes: { [MOBILE_SETUP_CODE_GRANT_TYPE]: GrantType },
            requireClientAuthentication: {
                [MOBILE_SETUP_CODE_GRANT_TYPE]: false,
            },
            allowExtendedTokenAttributes: true,
        });
        const response = new OAuth2Server.Response({});
        await server.token(
            new OAuth2Server.Request({
                method: 'POST',
                headers: {
                    'content-type': 'application/x-www-form-urlencoded',
                    'content-length': '150',
                },
                query: {},
                body: { ...validBody, client_id: client.id },
            }),
            response,
        );
        expect(response.body.lightdash_project_uuid).toBe(projectUuid);
        expect(response.body.access_token).toBeTruthy();
        expect(response.body.refresh_token).toBeTruthy();
    });
});
