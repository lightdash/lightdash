import { Ability } from '@casl/ability';
import {
    ContentAsCodeType,
    ForbiddenError,
    ParameterError,
    PromotionAction,
    type ExternalConnection,
    type ExternalConnectionAsCode,
    type PossibleAbilities,
    type RegisteredAccount,
} from '@lightdash/common';
import { lightdashConfigMock } from '../../../config/lightdashConfig.mock';
import { ExternalConnectionCoderService } from './ExternalConnectionCoderService';

const projectUuid = 'project-uuid';
const organizationUuid = 'organization-uuid';

const account = {
    user: { id: 'user-1', userUuid: 'user-1' },
} as unknown as RegisteredAccount;

const fullAbility = new Ability<PossibleAbilities>([
    {
        action: ['view', 'manage'],
        subject: 'ContentAsCode',
        conditions: { projectUuid, organizationUuid },
    },
    {
        action: 'manage',
        subject: 'ExternalConnection',
        conditions: { projectUuid, organizationUuid },
    },
]);

// ContentAsCode alone is not enough — the connection-manage gate must hold
const contentAsCodeOnlyAbility = new Ability<PossibleAbilities>([
    {
        action: ['view', 'manage'],
        subject: 'ContentAsCode',
        conditions: { projectUuid, organizationUuid },
    },
]);

// Arrays deliberately unsorted and header keys deliberately out of order to
// prove download normalization
const connection: ExternalConnection = {
    externalConnectionUuid: 'conn-uuid-1',
    projectUuid,
    organizationUuid,
    name: 'Stripe API',
    slug: 'stripe-api',
    type: 'api_key',
    origin: 'https://api.stripe.com',
    instructions: null,
    allowedPathPrefixes: ['/v2/', '/v1/'],
    allowedMethods: ['POST', 'GET'],
    allowedContentTypes: ['application/json'],
    responseMaxBytes: 1048576,
    requestMaxBytes: 262144,
    timeoutMs: 10000,
    rateLimitPerMinute: null,
    apiKeyName: 'Authorization',
    apiKeyLocation: 'header',
    oauthScopes: null,
    customHeaders: { 'x-b': '2', 'x-a': '1' },
    hasSecret: true,
    createdByUserUuid: 'user-1',
    updatedByUserUuid: 'user-1',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
};

const connectionAsCode: ExternalConnectionAsCode = {
    contentType: ContentAsCodeType.EXTERNAL_CONNECTION,
    version: 1,
    slug: 'stripe-api',
    name: 'Stripe API',
    type: 'api_key',
    origin: 'https://api.stripe.com',
    instructions: null,
    allowedPathPrefixes: ['/v1/', '/v2/'],
    allowedMethods: ['GET', 'POST'],
    allowedContentTypes: ['application/json'],
    responseMaxBytes: 1048576,
    requestMaxBytes: 262144,
    timeoutMs: 10000,
    rateLimitPerMinute: null,
    apiKeyName: 'Authorization',
    apiKeyLocation: 'header',
    oauthScopes: null,
    customHeaders: { 'x-a': '1', 'x-b': '2' },
};

const buildService = ({
    connections = [connection],
    existing = connection,
    storedSecret = null,
}: {
    connections?: ExternalConnection[];
    // null = no connection with that slug exists
    existing?: ExternalConnection | null;
    storedSecret?: string | null;
} = {}) => {
    const externalConnectionModel = {
        getProjectOrganizationUuid: vi.fn(async () => organizationUuid),
        list: vi.fn(async () => connections),
        findBySlug: vi.fn(async () => existing ?? undefined),
        getDecryptedSecret: vi.fn(async () => storedSecret),
    };
    const externalConnectionService = {
        create: vi.fn(async () => connection),
        update: vi.fn(async () => connection),
    };
    const service = new ExternalConnectionCoderService({
        externalConnectionModel: externalConnectionModel as never,
        externalConnectionService: externalConnectionService as never,
        lightdashConfig: lightdashConfigMock,
    });
    return { service, externalConnectionModel, externalConnectionService };
};

const mockAbility = (
    service: ExternalConnectionCoderService,
    ability: Ability<PossibleAbilities>,
) => {
    vi.spyOn(
        service as unknown as { createAuditedAbility: () => unknown },
        'createAuditedAbility',
    ).mockReturnValue(ability);
};

describe('ExternalConnectionCoderService downloads', () => {
    it('rejects a caller without manage:ExternalConnection', async () => {
        const { service } = buildService();
        mockAbility(service, contentAsCodeOnlyAbility);

        await expect(
            service.downloadExternalConnections(account, projectUuid),
        ).rejects.toThrow(ForbiddenError);
    });

    it('externalizes the read shape without uuids, secrets or audit fields, with sorted collections', async () => {
        const { service } = buildService();
        mockAbility(service, fullAbility);

        const result = await service.downloadExternalConnections(
            account,
            projectUuid,
        );

        expect(result.externalConnections).toEqual([connectionAsCode]);
        // Sorted headers must also be key-ordered for deterministic YAML
        expect(
            Object.keys(result.externalConnections[0].customHeaders ?? {}),
        ).toEqual(['x-a', 'x-b']);
        expect(result.externalConnections[0]).not.toHaveProperty('hasSecret');
        expect(result.externalConnections[0]).not.toHaveProperty(
            'externalConnectionUuid',
        );
        expect(result.total).toBe(1);
    });

    it('filters by slug and reports missing slugs', async () => {
        const { service } = buildService();
        mockAbility(service, fullAbility);

        const result = await service.downloadExternalConnections(
            account,
            projectUuid,
            ['stripe-api', 'not-there'],
        );

        expect(result.externalConnections.map(({ slug }) => slug)).toEqual([
            'stripe-api',
        ]);
        expect(result.missingSlugs).toEqual(['not-there']);
    });
});

describe('ExternalConnectionCoderService upserts', () => {
    it('rejects a caller without manage:ExternalConnection', async () => {
        const { service } = buildService();
        mockAbility(service, contentAsCodeOnlyAbility);

        await expect(
            service.upsertExternalConnection(
                account,
                projectUuid,
                'stripe-api',
                connectionAsCode,
            ),
        ).rejects.toThrow(ForbiddenError);
    });

    it('rejects a wrong contentType', async () => {
        const { service } = buildService();
        mockAbility(service, fullAbility);

        await expect(
            service.upsertExternalConnection(
                account,
                projectUuid,
                'stripe-api',
                {
                    ...connectionAsCode,
                    contentType: ContentAsCodeType.CHART as never,
                },
            ),
        ).rejects.toThrow(ParameterError);
    });

    it('rejects an unsupported version', async () => {
        const { service } = buildService();
        mockAbility(service, fullAbility);

        await expect(
            service.upsertExternalConnection(
                account,
                projectUuid,
                'stripe-api',
                {
                    ...connectionAsCode,
                    version: 2,
                },
            ),
        ).rejects.toThrow(ParameterError);
    });

    it('rejects a body slug that does not match the path slug', async () => {
        const { service } = buildService();
        mockAbility(service, fullAbility);

        await expect(
            service.upsertExternalConnection(
                account,
                projectUuid,
                'other-slug',
                connectionAsCode,
            ),
        ).rejects.toThrow(ParameterError);
    });

    it('rejects an invalid slug', async () => {
        const { service } = buildService();
        mockAbility(service, fullAbility);

        await expect(
            service.upsertExternalConnection(
                account,
                projectUuid,
                'Bad Slug!',
                {
                    ...connectionAsCode,
                    slug: 'Bad Slug!',
                },
            ),
        ).rejects.toThrow(ParameterError);
    });

    it('creates a missing connection through the domain service with the forced slug', async () => {
        const { service, externalConnectionService } = buildService({
            existing: null,
        });
        mockAbility(service, fullAbility);

        const result = await service.upsertExternalConnection(
            account,
            projectUuid,
            'stripe-api',
            connectionAsCode,
            'sk-secret',
        );

        expect(result.action).toBe(PromotionAction.CREATE);
        expect(externalConnectionService.create).toHaveBeenCalledWith(
            account,
            projectUuid,
            expect.objectContaining({
                name: 'Stripe API',
                type: 'api_key',
                secret: 'sk-secret',
            }),
            { slug: 'stripe-api' },
        );
    });

    it('returns NO_CHANGES for an identical document regardless of array and header order', async () => {
        const { service, externalConnectionService } = buildService();
        mockAbility(service, fullAbility);

        const result = await service.upsertExternalConnection(
            account,
            projectUuid,
            'stripe-api',
            {
                ...connectionAsCode,
                allowedPathPrefixes: ['/v2/', '/v1/'],
                allowedMethods: ['POST', 'GET'],
                customHeaders: { 'x-b': '2', 'x-a': '1' },
            },
        );

        expect(result.action).toBe(PromotionAction.NO_CHANGES);
        expect(externalConnectionService.update).not.toHaveBeenCalled();
    });

    it('returns NO_CHANGES when the supplied secret matches the stored one', async () => {
        const { service, externalConnectionService, externalConnectionModel } =
            buildService({ storedSecret: 'sk-secret' });
        mockAbility(service, fullAbility);

        const result = await service.upsertExternalConnection(
            account,
            projectUuid,
            'stripe-api',
            connectionAsCode,
            'sk-secret',
        );

        expect(result.action).toBe(PromotionAction.NO_CHANGES);
        expect(externalConnectionModel.getDecryptedSecret).toHaveBeenCalledWith(
            'conn-uuid-1',
        );
        expect(externalConnectionService.update).not.toHaveBeenCalled();
    });

    it('rotates only the secret when the config is unchanged but the secret differs', async () => {
        const { service, externalConnectionService } = buildService({
            storedSecret: 'old-secret',
        });
        mockAbility(service, fullAbility);

        const result = await service.upsertExternalConnection(
            account,
            projectUuid,
            'stripe-api',
            connectionAsCode,
            'new-secret',
        );

        expect(result.action).toBe(PromotionAction.UPDATE);
        expect(externalConnectionService.update).toHaveBeenCalledWith(
            account,
            projectUuid,
            'conn-uuid-1',
            { secret: 'new-secret' },
        );
    });

    it('updates through the domain service when the document changed', async () => {
        const { service, externalConnectionService } = buildService();
        mockAbility(service, fullAbility);

        const result = await service.upsertExternalConnection(
            account,
            projectUuid,
            'stripe-api',
            { ...connectionAsCode, instructions: 'Use the v2 endpoints only.' },
        );

        expect(result.action).toBe(PromotionAction.UPDATE);
        expect(externalConnectionService.update).toHaveBeenCalledWith(
            account,
            projectUuid,
            'conn-uuid-1',
            expect.objectContaining({
                instructions: 'Use the v2 endpoints only.',
                name: 'Stripe API',
            }),
        );
    });

    it('force updates an unchanged document', async () => {
        const { service, externalConnectionService } = buildService();
        mockAbility(service, fullAbility);

        const result = await service.upsertExternalConnection(
            account,
            projectUuid,
            'stripe-api',
            connectionAsCode,
            undefined,
            true,
        );

        expect(result.action).toBe(PromotionAction.UPDATE);
        expect(externalConnectionService.update).toHaveBeenCalled();
    });
});
