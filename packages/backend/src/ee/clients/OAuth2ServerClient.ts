import { Knex } from 'knex';
import {
    Adapter,
    AdapterPayload,
    ClientMetadata,
    Configuration,
    errors,
    Provider,
} from 'oidc-provider';
import path from 'path';
import { LightdashConfig } from '../../config/parseConfig';

class KnexAdapter implements Adapter {
    private readonly knex: Knex;

    private readonly model: string;

    constructor(model: string, knex: Knex) {
        this.model = model;
        this.knex = knex;
    }

    async upsert(
        id: string,
        payload: AdapterPayload,
        expiresIn?: number,
    ): Promise<void | undefined> {
        const expiresAt = expiresIn
            ? new Date(Date.now() + expiresIn * 1000)
            : null;
        const data = {
            id,
            payload,
            ...(expiresAt ? { expires_at: expiresAt } : {}),
            ...(payload.grantId ? { grant_id: payload.grantId } : {}),
            ...(payload.userCode ? { user_code: payload.userCode } : {}),
            ...(payload.uid ? { uid: payload.uid } : {}),
        };
        await this.knex(this.model).insert(data).onConflict('id').merge();
        console.log('upsert', data);
    }

    async find(id: string): Promise<AdapterPayload | undefined> {
        const row = await this.knex(this.model).where({ id }).first();
        return row ? row.payload : undefined;
    }

    async findByUserCode(
        userCode: string,
    ): Promise<AdapterPayload | undefined> {
        const row = await this.knex(this.model)
            .where({ user_code: userCode })
            .first();
        return row ? row.payload : undefined;
    }

    async findByUid(uid: string): Promise<AdapterPayload | undefined> {
        const row = await this.knex(this.model).where({ uid }).first();
        return row ? row.payload : undefined;
    }

    async destroy(id: string): Promise<void> {
        await this.knex(this.model).where({ id }).del();
    }

    async revokeByGrantId(grantId: string): Promise<void> {
        await this.knex(this.model).where({ grant_id: grantId }).del();
    }

    async consume(id: string): Promise<void> {
        await this.knex(this.model)
            .where({ id })
            .update({ 'payload.consumed': Math.floor(Date.now() / 1000) });
    }
}

function createOidcKnexAdapterFactory(knex: Knex) {
    return (model: string): Adapter => {
        console.log('Created adapter for ', model);
        return new KnexAdapter(model, knex);
    };
}

export class OAuth2ServerClient extends Provider {
    private readonly adapterFactory: (model: string) => Adapter;

    constructor(knex: Knex, lightdashConfig: LightdashConfig) {
        const adapterFactory = createOidcKnexAdapterFactory(knex);

        const issuerBase = lightdashConfig.siteUrl;
        const issuer = new URL(
            path.join('ee', 'oauth2'),
            issuerBase,
        ).toString();

        // Create audience for Lightdash API
        const audience = new URL(path.join('api'), issuerBase).toString();

        const clients: ClientMetadata[] = [
            {
                client_id: 'test-client',
                client_secret: 'test-secret',
                grant_types: ['client_credentials', 'refresh_token'],
                token_endpoint_auth_method: 'client_secret_post' as const,
                redirect_uris: [],
                response_types: [],
            },
        ];

        const cookieKeys = ['test-key'];
        const configuration: Configuration = {
            clients,
            adapter: adapterFactory,
            findAccount: (ctx, sub) => {
                throw new Error('Not implemented');
            },
            jwks: {
                keys: [
                    // We can rotate keys by adding a new key
                    // We should also update the resource indicator to use the new key
                    // Old keys are still used for verifying old tokens
                    {
                        p: 'yWWtSAIjAE_MOSmPCsd5YW8v8QH8Tgsqqe8vL6UvzSCuYTFirND-KIqnBW_4h63yUoDclEXvurvWKSfes0yzHZtEFecdHbb6fMhH567-Zyb5zREPW1LQ58UUyuRuPqEqiJ7nwcXlvDXaYy_SIepvLSu5_EeQ0_tYtoRwx42Yy4U',
                        kty: 'RSA',
                        q: 'o2d_tkRoE63Bpix4X84OqS3an_MZthjwh99toFRiqulKvA8ON6-tKdHfGiBPmVPLVEOrg1fbOIHaQ7-2PkpcHz_ebt41f2Hx1_sOaqXBE4DFAm_i6Yt_Pl8R8ijY_ThQ6wpHRQw8WWWT87u5hWOLqgFTTVKy-YwmkdT1uWmO9h0',
                        d: 'fKjnl2LrX73xQ-l7FS4LH3Lw1taCPvYPerD7TgnEcxYzONgTrF1F-90x-3dmntr_qWaLUI06nt_nlXtcZ_g-7EXEqOKiHnk0QTY7Zf5ffA6U91xN_oJY7K3WDmhO7p0EdPZdAaOcK1k9Wp0bWyUUT3AfeFsw-HrC5cmq3gzyHbIswIsqgzSdPfGNUqEkNYdKAaCxiC-YB7m7pxWIF0jrvzJcvMVE82CY4xZeaeEta3sjx6x5AimN1GHi4Xdm44OQ-5pL3UPj25WpYAqa9KpOkweaBzJP2_-rLipTPHwoKbwUPfdhMiD1gjMfyZUrDU98AXda_EJaAvu9wfdqInE2cQ',
                        e: 'AQAB',
                        use: 'sig',
                        kid: 'test-key',
                        qi: 'ICG3G64DV69R01zNH7A827AZt_yn9nvvXZglk1gGNOWlxqogYPW6nx8o6p6yZJ3RdaYJ8yRAorUR9SJCioyCMLcPP3n8SEbmCPqHl_r70khmVFkLL-bX_Q788xDZK1rlmwoHlpIdK0KNnZWKBpHs6PKXv1QM41W8LjaVlhSTbso',
                        dp: 'MsaSwIPhZTO5LnQ-3x3ZiWop8R5qCRcho4RtJhsEiTgDHvf_g8iRO5FxeJp5U2PUo15fvnY_cZnn7apiqFvfEMjTip4hJhu63Xj1QAFLnKAj_MKfV4vypWx3yIt9DAdAHP_LOHx3ZlNBgx5MYUakzwOmOWelqPxGqoWLlZQqgK0',
                        alg: 'RS256',
                        dq: 'hpYpt5tSSdsUo-T-5JIYuzmcV5_obnbOLmtVpPe8KN9sAcc4w577tnU5GBDC3xwIXgg6jTzgwAMcHi8aUOX4SHjXoWN-lsO6aVVMQ4TwqTqnieFT-V4_WMT_SABi8PXgmCboGrQARPWITfkxze72yvi6fvZ9mVLZNcY8-hE6gfU',
                        n: 'gI0ptmZl8lmU6l4uiSFZotJLPqF-BJ4S5R0zLnoWLq4-AVey1r5e-txe228j_g6RXGDGV3gWYXeDNshLY0rHIP06doNOGx9rGQEstYwNVbkVtRcCl-b9tk3oNfhsqJnzl-BEJ_IJp7_PfAxZopK-I1g3PFcPtmF4ZBwFuAQ43y51EvmVGTP-46kXcdVA2vdjqLauVYUhDFfjUnpw5_owf_EEd5cXG0ymSUx1Y1WNSBtFNaaTbXtKLQgcYz4dXARX90z5F-5B2ZY93a1VVD3RiAhWGVUAuci4Re_0FV5LHqiJ4l-lmY8B-YPAxz1hosxjrVZcE_4Ngm3GehsDTqbcEQ',
                    },
                ],
            },
            features: {
                devInteractions: { enabled: false },
                clientCredentials: { enabled: true }, // Allow client credentials grant
                introspection: { enabled: false },
                revocation: { enabled: true },
                deviceFlow: { enabled: false },
                backchannelLogout: { enabled: false },
                registration: { enabled: false },
                rpInitiatedLogout: { enabled: false },
                claimsParameter: { enabled: false },
                encryption: { enabled: false },
                jwtIntrospection: { enabled: false },
                jwtUserinfo: { enabled: false },
                pushedAuthorizationRequests: { enabled: false },
                resourceIndicators: {
                    enabled: true,
                    // If no (or multiple) resource indicator is provided we use the Lightdash API
                    // Needs to be updated if we add more resources
                    defaultResource: () => audience,

                    // There is only one resource available, the Lightdash API.
                    // In future we can add more resources here
                    getResourceServerInfo: (ctx, resourceIndicator, client) => {
                        if (resourceIndicator === audience) {
                            return {
                                audience,
                                scope: 'org:manage',
                                accessTokenFormat: 'jwt',
                                accessTokenTTL: 3600,
                                jwt: {
                                    // Tokens issued by this provider will be signed with the RS256 algorithm
                                    // They will use the test-key from the jwks above
                                    sign: {
                                        alg: 'RS256',
                                        kid: 'test-key',
                                    },
                                },
                            };
                        }
                        throw new errors.InvalidTarget();
                    },
                },
                // requestObjects: { request: false, requestUri: false },
                userinfo: { enabled: false },
            },
            claims: {},
            interactions: {
                url: () => {
                    throw new Error('Interactions are disabled');
                },
            },
            cookies: {
                keys: cookieKeys,
            },
            ttl: {
                ClientCredentials: (ctx, token, client) =>
                    token.resourceServer?.accessTokenTTL ?? 3600, // 1 hour
            },
        };

        super(issuer, configuration);
        this.adapterFactory = adapterFactory;

        const c = new Client(clients[0]);
    }

    async addClient() {
        const adapter = this.adapterFactory('Client');
        await adapter.upsert(
            'another-client',
            {
                application_type: 'web',
                request_uris: [],
                client_id: 'another-client',
                client_secret: 'another-secret',
                grant_types: ['client_credentials', 'refresh_token'],
                token_endpoint_auth_method: 'client_secret_post' as const,
                redirect_uris: [],
            },
            3600,
        );
    }
}
