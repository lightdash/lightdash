import { Ability } from '@casl/ability';
import { AgentCapability, NotFoundError } from '@lightdash/common';
import { fromSession } from '../account/account';
import { defaultSessionUser } from '../account/account.mock';
import { AgentConnectionService } from './AgentConnectionService';
import { projectGrantFixture } from './grant.mock';
import { managedExecutionFixture } from './managedExecution.mock';

const setup = () => {
    const f = managedExecutionFixture();
    const { grant } = f;
    const account = fromSession(
        {
            ...defaultSessionUser,
            userUuid: grant.subjectUserUuid,
            organizationUuid: grant.organizationUuid,
        },
        'cookie',
    );
    const model = {
        listForSubject: vi.fn().mockResolvedValue([grant]),
        find: vi.fn().mockResolvedValue(grant),
        revoke: vi
            .fn()
            .mockImplementation(async ({ revokedByUserUuid, reason }) => {
                if (!grant.revokedAt)
                    Object.assign(grant, {
                        revokedAt: new Date(),
                        revokedByUserUuid,
                        revocationReason: reason,
                    });
            }),
    };
    const deps = {
        model,
        userModel: {
            findSessionUserAndOrgByUuid: vi.fn().mockResolvedValue(f.user),
        },
        projectModel: {
            getAllByOrganizationUuid: vi
                .fn()
                .mockResolvedValue([
                    { projectUuid: f.projectUuid, name: 'Visible project' },
                ]),
        },
        featureFlags: { get: vi.fn().mockResolvedValue({ enabled: true }) },
        getAgentPermissionService: () => f.permissions,
    };
    const service = new AgentConnectionService(deps);
    return { ...f, account, model, service, deps };
};

it('revokes an owned connection through the model and retains the first facts', async () => {
    const { grant, account, model, service } = setup();
    const args = {
        grantUuid: grant.grantUuid,
        organizationUuid: grant.organizationUuid,
        actor: account,
        reason: 'owner_revoked',
    };
    await service.revoke(args);
    const facts = { ...grant };
    await service.revoke({ ...args, reason: 'second_reason' });
    expect(model.revoke).toHaveBeenCalledWith({
        grantUuid: grant.grantUuid,
        organizationUuid: grant.organizationUuid,
        revokedByUserUuid: account.user.id,
        reason: 'owner_revoked',
    });
    expect(grant).toEqual(facts);
});
it.each(['owner', 'organization', 'missing'])(
    'hides a %s mismatch without revoking',
    async (mismatch) => {
        const { grant, account, model, service } = setup();
        if (mismatch === 'owner') grant.subjectUserUuid = 'other';
        if (mismatch === 'organization') grant.organizationUuid = 'other';
        if (mismatch === 'missing') model.find.mockResolvedValue(null);
        await expect(
            service.revoke({
                grantUuid: 'grant',
                organizationUuid: 'org',
                actor: account,
                reason: 'owner_revoked',
            }),
        ).rejects.toBeInstanceOf(NotFoundError);
        expect(model.revoke).not.toHaveBeenCalled();
    },
);
it('does not let an actor supply another organisation', async () => {
    const { grant, account, model, service } = setup();
    grant.organizationUuid = 'other';
    await expect(
        service.revoke({
            grantUuid: 'grant',
            organizationUuid: 'other',
            actor: account,
            reason: 'owner_revoked',
        }),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(model.revoke).not.toHaveBeenCalled();
});
it.each(['replaced', 'refresh_reuse', 'refresh_token_revoked'])(
    'uses the same lifecycle for internal %s',
    async (reason) => {
        const { model, service } = setup();
        await service.revoke({
            grantUuid: 'grant',
            organizationUuid: 'org',
            actor: null,
            reason,
        });
        expect(model.revoke).toHaveBeenCalledWith({
            grantUuid: 'grant',
            organizationUuid: 'org',
            revokedByUserUuid: null,
            reason,
        });
    },
);
it('allows an owner to revoke an expired connection', async () => {
    const { grant, account, service } = setup();
    grant.expiresAt = new Date(0);
    await service.revoke({
        grantUuid: 'grant',
        organizationUuid: 'org',
        actor: account,
        reason: 'owner_revoked',
    });
    expect(grant.revokedAt).not.toBeNull();
});

it('lists only the owner and organisation with a safe explicit projection', async () => {
    const f = setup();
    const result = await f.service.list(f.account);
    expect(f.model.listForSubject).toHaveBeenCalledWith({
        organizationUuid: 'org',
        subjectUserUuid: 'user',
    });
    expect(result).toEqual([
        {
            grantUuid: 'grant',
            name: 'cli',
            clientId: 'lightdash-cli',
            approvedProjects: [
                {
                    projectUuid: f.projectUuid,
                    name: 'Visible project',
                    approvedCapabilities: f.grant.approvedCapabilities,
                },
            ],
            approvedAt: f.grant.approvedAt,
            expiresAt: f.grant.expiresAt,
            lastUsedAt: null,
            status: 'active',
            limitsStatus: 'ok',
            revokedAt: null,
        },
    ]);
    expect(JSON.stringify(result)).not.toMatch(
        /token|family|secret|resource|approvalRequest/i,
    );
});
it('shows UUIDs without names for projects the person no longer sees', async () => {
    const f = setup();
    f.user.ability = new Ability([]);
    const [result] = await f.service.list(f.account);
    expect(result.approvedProjects[0]).toMatchObject({
        projectUuid: f.projectUuid,
        name: null,
    });
});
it('shows project-specific approval and current managed policy restrictions', async () => {
    const f = setup();
    Object.assign(f.grant, projectGrantFixture());
    f.user.ability = new Ability([{ action: 'manage', subject: 'all' }]);
    f.deps.projectModel.getAllByOrganizationUuid.mockResolvedValue(
        f.grant.approvedProjectUuids.map((projectUuid) => ({
            projectUuid,
            name: projectUuid,
        })),
    );
    const result = await f.service.status(f.account, 'grant');
    expect(
        result.approvedProjects.map((project) => project.approvedCapabilities),
    ).toEqual([[AgentCapability.Query], [AgentCapability.DeployUpload]]);
    expect(result.effectiveProjects[0].capabilities).toContainEqual({
        capability: AgentCapability.Query,
        allowed: true,
        reason: null,
    });
    f.policy.systemRoleMatrix.viewer = [];
    const restricted = await f.service.status(f.account, 'grant');
    expect(restricted.effectiveProjects[0].capabilities).toContainEqual({
        capability: AgentCapability.Query,
        allowed: false,
        reason: 'agent_policy',
    });
    expect(f.grant.resourceConstraints).toEqual(
        projectGrantFixture().resourceConstraints,
    );
});
it('loads the person fresh and reports lost project rights', async () => {
    const f = setup();
    f.user.ability = new Ability([]);
    const result = await f.service.status(f.account, 'grant');
    expect(
        result.effectiveProjects[0].capabilities.every(
            (c) => !c.allowed && c.reason === 'project_access',
        ),
    ).toBe(true);
    expect(f.deps.userModel.findSessionUserAndOrgByUuid).toHaveBeenCalledWith(
        'user',
        'org',
    );
});
it('allows human recovery with the shared flag off and explains unavailable effective access', async () => {
    const f = setup();
    f.deps.featureFlags.get.mockResolvedValue({ enabled: false });
    await expect(f.service.list(f.account)).resolves.toHaveLength(1);
    const result = await f.service.status(f.account, 'grant');
    expect(
        result.effectiveProjects[0].capabilities.every(
            (c) => c.reason === 'agent_identity_disabled',
        ),
    ).toBe(true);
    await f.service.revoke({
        grantUuid: 'grant',
        organizationUuid: 'org',
        actor: f.account,
        reason: 'owner_revoked',
    });
    expect(f.grant.revokedAt).not.toBeNull();
});
it.each(
    Object.values(AgentCapability).filter(
        (c) =>
            ![
                AgentCapability.ReadDiscover,
                AgentCapability.Export,
                AgentCapability.DbtWriteback,
                AgentCapability.ExternalTools,
            ].includes(c),
    ),
)(
    'reports lost ordinary person rights for %s even if agent policy still permits it',
    async (capability) => {
        const f = setup();
        f.user.ability = new Ability([{ action: 'manage', subject: 'all' }]);
        let result = await f.service.status(f.account, 'grant');
        expect(result.effectiveProjects[0].capabilities).toContainEqual({
            capability,
            allowed: true,
            reason: null,
        });
        f.user.ability = new Ability([{ action: 'view', subject: 'Project' }]);
        result = await f.service.status(f.account, 'grant');
        expect(result.effectiveProjects[0].capabilities).toContainEqual({
            capability,
            allowed: false,
            reason: 'person_permission',
        });
    },
);
it('propagates policy storage errors instead of reporting permission refusal', async () => {
    const f = setup();
    vi.spyOn(f.permissions, 'assertOperation').mockRejectedValue(
        new Error('storage unavailable'),
    );
    await expect(f.service.status(f.account, 'grant')).rejects.toThrow(
        'storage unavailable',
    );
});

it('reports the version 1 flat approval for each project', async () => {
    const f = setup();
    f.grant.approvedProjectUuids.push('second-project');
    const [record] = await f.service.list(f.account);
    expect(
        record.approvedProjects.map((project) => project.approvedCapabilities),
    ).toEqual([f.grant.approvedCapabilities, f.grant.approvedCapabilities]);
});
it.each(['expired', 'revoked'] as const)(
    'reports %s state and refuses effective actions without evaluating policy',
    async (state) => {
        const f = setup();
        if (state === 'expired') f.grant.expiresAt = new Date(0);
        else f.grant.revokedAt = new Date();
        const policy = vi.spyOn(f.permissions, 'assertOperation');
        const result = await f.service.status(f.account, 'grant');
        expect(result.status).toBe(state);
        expect(
            result.effectiveProjects[0].capabilities.every(
                (capability) =>
                    !capability.allowed && capability.reason === state,
            ),
        ).toBe(true);
        expect(policy).not.toHaveBeenCalled();
    },
);
it('re-evaluates current person role assignments through the real policy service', async () => {
    const f = setup();
    const before = await f.service.status(f.account, 'grant');
    expect(
        before.effectiveProjects[0].capabilities.find(
            (c) => c.capability === AgentCapability.Query,
        )?.allowed,
    ).toBe(true);
    f.assignments.systemRoles = [];
    const after = await f.service.status(f.account, 'grant');
    expect(after.effectiveProjects[0].capabilities).toContainEqual({
        capability: AgentCapability.Query,
        allowed: false,
        reason: 'agent_policy',
    });
});

it('does not load organisation projects for an empty connection list', async () => {
    const f = setup();
    f.model.listForSubject.mockResolvedValue([]);
    await expect(f.service.list(f.account)).resolves.toEqual([]);
    expect(f.deps.projectModel.getAllByOrganizationUuid).not.toHaveBeenCalled();
});
it.each([
    AgentCapability.Export,
    AgentCapability.DbtWriteback,
    AgentCapability.ExternalTools,
])('refuses unsupported %s before checking policy', async (capability) => {
    const f = setup();
    f.user.ability = new Ability([{ action: 'manage', subject: 'all' }]);
    f.grant.approvedCapabilities = [capability];
    const policy = vi
        .spyOn(f.permissions, 'assertOperation')
        .mockResolvedValue();
    const result = await f.service.status(f.account, 'grant');
    expect(result.effectiveProjects[0].capabilities).toEqual([
        { capability, allowed: false, reason: 'not_supported' },
    ]);
    expect(policy).not.toHaveBeenCalled();
});
