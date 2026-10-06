import {
    AI_DIRECT_TRANSPORT,
    AiAccessRefusalReason,
    AiAccessRefusedError,
    AiCredentialMethod,
    AiPrincipalFailureReason,
    AiPrincipalKind,
    AiPrincipalStatus,
    AiProcedureRights,
    AiSetupScriptFormat,
    AiTransportKind,
    QueryExecutionContext,
    WarehouseTypes,
    type AiAccessPolicy,
    type AiPrincipalWithSecrets,
    type AiProbeResult,
    type CreateWarehouseCredentials,
} from '@lightdash/common';
import { type LightdashAnalytics } from '../../analytics/LightdashAnalytics';
import { type LightdashConfig } from '../../config/parseConfig';
import { type AiPrincipalModel } from '../../models/AiPrincipalModel/AiPrincipalModel';
import { type FeatureFlagModel } from '../../models/FeatureFlagModel/FeatureFlagModel';
import { type GroupsModel } from '../../models/GroupsModel';
import { type ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { type UserModel } from '../../models/UserModel';
import { AiAccessService, type ResolvePlanArgs } from './AiAccessService';
import {
    type AiCreatedSecret,
    type AiCredentialProvider,
} from './providers/AiCredentialProvider';
import { getAiCredentialProvider } from './providers/registry';

const connection: CreateWarehouseCredentials = {
    type: WarehouseTypes.POSTGRES,
    host: 'localhost',
    port: 5432,
    user: 'connection',
    password: 'test',
    dbname: 'test',
    schema: 'public',
};
const args: ResolvePlanArgs = {
    projectUuid: 'project',
    organizationUuid: 'org',
    warehouseConnectionUuid: null,
    connection,
    context: QueryExecutionContext.AI,
    userUuid: 'user',
    isRegisteredUser: true,
    isServiceAccount: false,
};
const policy: AiAccessPolicy = {
    aiAccessPolicyUuid: 'policy',
    projectUuid: 'project',
    warehouseConnectionUuid: null,
    enabled: true,
    principalKind: AiPrincipalKind.SHARED,
    transport: AI_DIRECT_TRANSPORT,
    sharedRef: 'ai_shared',
    twinNameTemplate: 'ai_{email_local_part}_{user_uuid}',
    groupMappings: [],
    policySource: null,
    createdAt: new Date(),
    updatedAt: new Date(),
};
const principal: AiPrincipalWithSecrets = {
    aiPrincipalUuid: 'principal',
    aiAccessPolicyUuid: 'policy',
    kind: AiPrincipalKind.SHARED,
    ref: 'ai_shared',
    userUuid: null,
    groupUuid: null,
    status: AiPrincipalStatus.PENDING,
    failureReason: null,
    statusMessage: null,
    lastProbe: null,
    publicKey: null,
    publicKeyFingerprint: null,
    secret: null,
    createdAt: new Date(),
    updatedAt: new Date(),
};

const setup = () => {
    const model = {
        findPolicy: vi.fn(async (): Promise<AiAccessPolicy | null> => policy),
        findPrincipalByRef: vi.fn(
            async (): Promise<AiPrincipalWithSecrets | null> => principal,
        ),
        findPrincipalForUser: vi.fn(
            async (): Promise<AiPrincipalWithSecrets | null> => principal,
        ),
        createPrincipal: vi.fn(async () => principal),
        getPrincipal: vi.fn(async () => principal),
        setSecret: vi.fn(async () => {}),
        recordProbe: vi.fn(async (_id: string, probe: AiProbeResult) => ({
            ...principal,
            status: probe.ok
                ? AiPrincipalStatus.READY
                : AiPrincipalStatus.FAILED,
            lastProbe: probe,
        })),
    };
    const provider = {
        warehouseType: WarehouseTypes.POSTGRES,
        capabilities: vi.fn(() => ({
            warehouseType: WarehouseTypes.POSTGRES,
            principals: {
                person: {
                    available: true as const,
                    method: AiCredentialMethod.KEY,
                },
                twin: {
                    available: true as const,
                    method: AiCredentialMethod.KEY,
                },
                group: {
                    available: true as const,
                    method: AiCredentialMethod.KEY,
                },
                shared: {
                    available: true as const,
                    method: AiCredentialMethod.KEY,
                },
            },
            transports: {
                direct: { available: true as const },
                procedure: { available: true as const },
            },
            setupFormat: AiSetupScriptFormat.SQL,
        })),
        createSecret: vi.fn(async (): Promise<AiCreatedSecret | null> => null),
        mint: vi.fn(async () => ({
            credentials: { ...connection, user: 'ai' },
            assurances: [],
            expiresAt: null,
        })),
        probe: vi.fn(
            async (): Promise<AiProbeResult> => ({
                ok: true,
                checkedAt: new Date(),
                observed: {},
            }),
        ),
        setupScript: vi.fn(),
    } satisfies AiCredentialProvider;
    const flags = { get: vi.fn(async () => ({ enabled: true })) };
    const groups = {
        findUserGroups: vi.fn(
            async (): Promise<{ uuid: string; name: string }[]> => [],
        ),
    };
    const registry = vi.fn((): AiCredentialProvider => provider);
    const service = new AiAccessService({
        lightdashConfig: {} as LightdashConfig,
        analytics: {} as LightdashAnalytics,
        aiPrincipalModel: model as unknown as AiPrincipalModel,
        groupsModel: groups as unknown as GroupsModel,
        featureFlagModel: flags as unknown as FeatureFlagModel,
        projectModel: {} as ProjectModel,
        userModel: {
            getUserDetailsByUuid: vi.fn(async () => ({
                email: 'a.b+tag@example.test',
            })),
        } as unknown as UserModel,
        providerRegistry: registry,
    });
    return { service, model, provider, flags, groups, registry };
};

describe('AiAccessService', () => {
    test('creates and reloads a secret before minting', async () => {
        const { service, model, provider } = setup();
        const created = {
            secret: 'generated',
            publicKey: null,
            publicKeyFingerprint: null,
        };
        provider.createSecret.mockResolvedValue(created);
        model.getPrincipal.mockResolvedValue({ ...principal, ...created });
        await service.resolvePlan(args);
        expect(model.setSecret).toHaveBeenCalledWith('principal', created);
        expect(model.getPrincipal).toHaveBeenCalledWith('principal');
        expect(provider.mint).toHaveBeenCalledWith(
            expect.objectContaining({
                principal: expect.objectContaining({ secret: 'generated' }),
            }),
        );
        expect(provider.createSecret.mock.invocationCallOrder[0]).toBeLessThan(
            model.setSecret.mock.invocationCallOrder[0],
        );
        expect(model.setSecret.mock.invocationCallOrder[0]).toBeLessThan(
            model.getPrincipal.mock.invocationCallOrder[0],
        );
        expect(model.getPrincipal.mock.invocationCallOrder[0]).toBeLessThan(
            provider.mint.mock.invocationCallOrder[0],
        );
    });
    test('does not save a secret for a broker', async () => {
        const { service, model, provider } = setup();
        await service.resolvePlan(args);
        expect(provider.createSecret).toHaveBeenCalledOnce();
        expect(model.setSecret).not.toHaveBeenCalled();
    });
    test('creates a secret for setup without minting or probing', async () => {
        const { service, model, provider } = setup();
        const created = {
            secret: 'generated',
            publicKey: null,
            publicKeyFingerprint: null,
        };
        provider.createSecret.mockResolvedValue(created);
        model.getPrincipal.mockResolvedValue({ ...principal, ...created });
        const result = await service.getAiAccessForUser(args);
        expect(model.setSecret).toHaveBeenCalledWith('principal', created);
        expect(model.getPrincipal).toHaveBeenCalledWith('principal');
        expect(result.principal).not.toHaveProperty('secret');
        expect(provider.mint).not.toHaveBeenCalled();
        expect(provider.probe).not.toHaveBeenCalled();
    });
    test('keeps an existing secret', async () => {
        const { service, model, provider } = setup();
        model.findPrincipalByRef.mockResolvedValue({
            ...principal,
            secret: 'existing',
        });
        await service.resolvePlan(args);
        expect(provider.createSecret).not.toHaveBeenCalled();
        expect(model.setSecret).not.toHaveBeenCalled();
    });
    test('ignores non-AI contexts before checking flags', async () => {
        const { service, flags } = setup();
        expect(
            await service.resolvePlan({
                ...args,
                context: QueryExecutionContext.SQL_RUNNER,
            }),
        ).toBeNull();
        expect(flags.get).not.toHaveBeenCalled();
    });
    test('ignores a disabled flag', async () => {
        const { service, model, flags } = setup();
        flags.get.mockResolvedValue({ enabled: false });
        expect(await service.resolvePlan(args)).toBeNull();
        expect(model.findPolicy).not.toHaveBeenCalled();
    });
    test.each([null, { ...policy, enabled: false }])(
        'ignores no enabled policy: %s',
        async (value) => {
            const { service, model, provider } = setup();
            model.findPolicy.mockResolvedValue(value);
            expect(await service.resolvePlan(args)).toBeNull();
            expect(provider.mint).not.toHaveBeenCalled();
        },
    );
    test.each([{ isServiceAccount: true }, { isRegisteredUser: false }])(
        'refuses non-person callers: %s',
        async (caller) => {
            const { service, provider } = setup();
            await expect(
                service.resolvePlan({ ...args, ...caller }),
            ).rejects.toMatchObject({
                refusal: { reason: AiAccessRefusalReason.SERVICE_ACCOUNT },
            });
            expect(provider.mint).not.toHaveBeenCalled();
        },
    );
    test('selects the highest group priority and uses names to break ties', async () => {
        const { service, model, groups } = setup();
        groups.findUserGroups.mockResolvedValue([
            { uuid: 'a', name: 'Alpha' },
            { uuid: 'b', name: 'Beta' },
            { uuid: 'c', name: 'Charlie' },
        ]);
        model.findPolicy.mockResolvedValue({
            ...policy,
            principalKind: AiPrincipalKind.GROUP,
            groupMappings: [
                {
                    groupUuid: 'c',
                    groupName: 'Charlie',
                    ref: 'low',
                    priority: 1,
                },
                { groupUuid: 'b', groupName: 'Beta', ref: 'beta', priority: 2 },
                {
                    groupUuid: 'a',
                    groupName: 'Alpha',
                    ref: 'alpha',
                    priority: 2,
                },
            ],
        });
        await service.resolvePlan(args);
        expect(model.findPrincipalByRef).toHaveBeenCalledWith({
            aiAccessPolicyUuid: 'policy',
            ref: 'alpha',
        });
    });
    test('refuses when no group mapping matches', async () => {
        const { service, model } = setup();
        model.findPolicy.mockResolvedValue({
            ...policy,
            principalKind: AiPrincipalKind.GROUP,
        });
        await expect(service.resolvePlan(args)).rejects.toMatchObject({
            refusal: { reason: AiAccessRefusalReason.NO_GROUP_MAPPING },
        });
    });
    test('fills and sanitizes the twin name template', async () => {
        const { service, model } = setup();
        model.findPolicy.mockResolvedValue({
            ...policy,
            principalKind: AiPrincipalKind.TWIN,
        });
        model.findPrincipalForUser.mockResolvedValue(null);
        model.findPrincipalByRef.mockResolvedValue(null);
        await service.resolvePlan(args);
        expect(model.createPrincipal).toHaveBeenCalledWith({
            aiAccessPolicyUuid: 'policy',
            kind: AiPrincipalKind.TWIN,
            ref: 'ai_a_b_tag_user',
            userUuid: 'user',
            groupUuid: null,
        });
    });
    test('probes a pending principal and returns it ready without secrets', async () => {
        const { service, model, provider } = setup();
        const plan = await service.resolvePlan(args);
        expect(provider.probe).toHaveBeenCalledOnce();
        expect(model.recordProbe).toHaveBeenCalledWith(
            'principal',
            expect.objectContaining({ ok: true }),
        );
        expect(plan?.principal.status).toBe(AiPrincipalStatus.READY);
        expect(plan?.principal).not.toHaveProperty('secret');
        expect(plan?.audit.queryTags).toEqual({ ai_principal: 'ai_shared' });
    });
    test('records a failed probe and refuses', async () => {
        const { service, model, provider } = setup();
        provider.probe.mockResolvedValue({
            ok: false,
            checkedAt: new Date(),
            observed: {},
            reason: AiPrincipalFailureReason.WRONG_PRINCIPAL,
            message: 'Wrong principal',
        });
        await expect(service.resolvePlan(args)).rejects.toMatchObject({
            refusal: {
                reason: AiAccessRefusalReason.PRINCIPAL_FAILED,
                message: 'Wrong principal',
            },
        });
        expect(model.recordProbe).toHaveBeenCalledWith(
            'principal',
            expect.objectContaining({ ok: false }),
        );
        expect((await model.recordProbe.mock.results[0].value).status).toBe(
            AiPrincipalStatus.FAILED,
        );
    });
    test.each([0, 61 * 60 * 1000])(
        'reprobes ready principals only after an hour (%s)',
        async (age) => {
            const { service, model, provider } = setup();
            model.findPrincipalByRef.mockResolvedValue({
                ...principal,
                status: AiPrincipalStatus.READY,
                lastProbe: {
                    ok: true,
                    checkedAt: new Date(Date.now() - age),
                    observed: {},
                },
            });
            await service.resolvePlan(args);
            expect(provider.probe).toHaveBeenCalledTimes(age === 0 ? 0 : 1);
        },
    );
    test('refuses failed principals without minting', async () => {
        const { service, model, provider } = setup();
        model.findPrincipalByRef.mockResolvedValue({
            ...principal,
            status: AiPrincipalStatus.FAILED,
            statusMessage: 'Check failed',
        });
        await expect(service.resolvePlan(args)).rejects.toMatchObject({
            refusal: {
                reason: AiAccessRefusalReason.PRINCIPAL_FAILED,
                message: 'Check failed',
            },
        });
        expect(provider.mint).not.toHaveBeenCalled();
    });
    test('reports pending access without mint or probe', async () => {
        const { service, provider } = setup();
        expect(await service.getAiAccessForUser(args)).toMatchObject({
            enabled: true,
            refusal: null,
            principal: { status: AiPrincipalStatus.PENDING },
        });
        expect(provider.mint).not.toHaveBeenCalled();
        expect(provider.probe).not.toHaveBeenCalled();
    });
    test('reports refusal shapes without mint or probe', async () => {
        const { service, provider } = setup();
        const result = await service.getAiAccessForUser({
            ...args,
            isServiceAccount: true,
        });
        expect(result.refusal).toEqual(
            new AiAccessRefusedError(AiAccessRefusalReason.SERVICE_ACCOUNT)
                .refusal,
        );
        expect(provider.mint).not.toHaveBeenCalled();
        expect(provider.probe).not.toHaveBeenCalled();
    });
    test('gates procedure transport separately', async () => {
        const { service, model, flags, provider } = setup();
        model.findPolicy.mockResolvedValue({
            ...policy,
            transport: {
                kind: AiTransportKind.PROCEDURE,
                name: 'ai_query',
                rights: AiProcedureRights.DEFINER,
            },
        });
        flags.get
            .mockResolvedValueOnce({ enabled: true })
            .mockResolvedValueOnce({ enabled: false });
        await expect(service.resolvePlan(args)).rejects.toMatchObject({
            refusal: { reason: AiAccessRefusalReason.TRANSPORT_UNAVAILABLE },
        });
        expect(provider.mint).not.toHaveBeenCalled();
    });
    test.each(
        Object.values(WarehouseTypes).filter(
            (type) => type !== WarehouseTypes.POSTGRES,
        ),
    )('registry refuses %s with its capability reason', async (type) => {
        const { service, registry } = setup();
        const unavailable = getAiCredentialProvider(type);
        registry.mockReturnValue(unavailable);
        const capabilities = unavailable.capabilities(connection);
        expect(
            Object.values(capabilities.principals).every((c) => !c.available),
        ).toBe(true);
        expect(
            Object.values(capabilities.transports).every((c) => !c.available),
        ).toBe(true);
        const capability = capabilities.principals.shared;
        if (capability.available)
            throw new Error('Expected unavailable provider');
        await expect(service.resolvePlan(args)).rejects.toMatchObject({
            refusal: {
                reason: AiAccessRefusalReason.WAREHOUSE_NOT_SUPPORTED,
                message: capability.reason,
            },
        });
        await expect(
            unavailable.mint({
                connection,
                principal,
                policy,
                person: { userUuid: 'user', email: 'user@example.test' },
            }),
        ).rejects.toBeInstanceOf(AiAccessRefusedError);
        await expect(unavailable.probe(connection, [])).rejects.toBeInstanceOf(
            AiAccessRefusedError,
        );
        expect(() =>
            unavailable.setupScript({ connection, principal, policy }),
        ).toThrow(AiAccessRefusedError);
    });
});
