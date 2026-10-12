import { Ability } from '@casl/ability';
import {
    AiAccessRefusalReason,
    AgentCapability as C,
    type AgentPermissionCheck,
} from '@lightdash/common';
import { fromSession } from '../../auth/account/account';
import { defaultSessionUser } from '../../auth/account/account.mock';
import {
    GRANT_OPERATION_CONTRACTS,
    supportsAgentConnectionCapability,
} from '../../auth/agentConnectionGrants/operationContracts';
import { parseGrantResourceConstraints } from '../../auth/agentConnectionGrants/resourceConstraints';
import { getRequiredAgentCapabilities } from '../../auth/agentPermissions/capabilityMap';
import { type DbAgentConnectionApprovalRequest } from '../../database/entities/agentConnectionApprovalRequests';
import { type AgentPermissionBulkArgs } from '../AgentPermissionService/agentPermissionBulkEvaluation';
import { AgentConnectionApprovalService } from './AgentConnectionApprovalService';
import {
    approvalOperationCatalogue,
    sealSelection,
    type ApprovalProject,
} from './approvalReview';

const a = '11111111-1111-4111-8111-111111111111';
const b = '22222222-2222-4222-8222-222222222222';
const account = fromSession(defaultSessionUser, 'session');
const row = {
    organization_uuid: defaultSessionUser.organizationUuid,
    subject_user_uuid: defaultSessionUser.userUuid,
    requested_projects: null,
    requested_capabilities: Object.values(C),
} as DbAgentConnectionApprovalRequest;
const refused: AgentPermissionCheck = {
    id: 'capability',
    kind: 'capability',
    label: '',
    status: 'refused',
    message: '',
    capability: C.Query,
    reason: AiAccessRefusalReason.AGENT_CAPABILITY_DENIED,
    policyLayer: 'org_ceiling',
    settingsUrl: null,
};
const fixture = () => {
    const deps = {
        siteUrl: 'https://instance.example',
        model: { insertPending: vi.fn(), findOwned: vi.fn() },
        userModel: {
            findSessionUserAndOrgByUuid: vi
                .fn()
                .mockResolvedValue(defaultSessionUser),
        },
        projectModel: {
            getAllByOrganizationUuid: vi.fn().mockResolvedValue([
                { projectUuid: a, name: 'A' },
                { projectUuid: b, name: 'B' },
            ]),
        },
        oauthModel: { getClient: vi.fn(), validateRedirectUriStrict: vi.fn() },
        featureFlags: { get: vi.fn().mockResolvedValue({ enabled: true }) },
        reviewModel: {
            getScheduledRefreshProjectUuids: vi.fn().mockResolvedValue([]),
        },
        agentPermissionService: {
            evaluateOperations: vi
                .fn()
                .mockImplementation(
                    async ({ operations }: AgentPermissionBulkArgs) =>
                        operations.map(() => null),
                ),
        },
    };
    return { deps, service: new AgentConnectionApprovalService(deps) };
};
const capability = (project: ApprovalProject, key: C) =>
    project.capabilities.find((c) => c.capability === key)!;

it('pins every real admitted contract, base requirement and payload effect', () => {
    expect(
        Object.entries(GRANT_OPERATION_CONTRACTS).map(([key, contract]) => ({
            key,
            kind: contract.kind,
            required: getRequiredAgentCapabilities('rest', key),
            candidates: approvalOperationCatalogue.filter(
                (op) => op.key === key,
            ),
        })),
    ).toMatchSnapshot();
    expect(
        approvalOperationCatalogue.every((op) =>
            Object.hasOwn(GRANT_OPERATION_CONTRACTS, op.key),
        ),
    ).toBe(true);
    expect(Object.values(C).filter(supportsAgentConnectionCapability)).toEqual([
        C.ReadDiscover,
        C.Query,
        C.RawSql,
        C.ContentWrite,
        C.Delete,
        C.Publish,
        C.DeployUpload,
        C.Administration,
    ]);
    for (const c of Object.values(C)) {
        expect(
            approvalOperationCatalogue.some((op) =>
                op.capabilities.includes(c),
            ),
        ).toBe(supportsAgentConnectionCapability(c));
    }
});

it('returns different answers for Query in A and Deploy in B; unsupported capabilities stay hidden', async () => {
    const { deps, service } = fixture();
    deps.agentPermissionService.evaluateOperations.mockImplementation(
        async ({ operations }: AgentPermissionBulkArgs) =>
            operations.map((op) => {
                const required =
                    op.kind === 'capability'
                        ? [op.key]
                        : getRequiredAgentCapabilities('rest', op.key);
                const allowed = op.projectUuid === a ? C.Query : C.DeployUpload;
                return required?.every((c) => c === allowed) ? null : refused;
            }),
    );
    const answer = await service.getReviewAnswer(account, row);
    expect(
        answer.map((p) => [
            p.name,
            capability(p, C.Query).visibility,
            capability(p, C.DeployUpload).visibility,
        ]),
    ).toEqual([
        ['A', 'offered', 'blocked'],
        ['B', 'blocked', 'offered'],
    ]);
    expect(capability(answer[0], C.Export)).toEqual({
        capability: C.Export,
        visibility: 'hidden',
        reasonCode: 'unsupported',
        reason: 'This action is not available for connections.',
    });
    expect(capability(answer[0], C.DeployUpload).reasonCode).toBe(
        'role_denied',
    );
    expect(answer.every((p) => !Object.hasOwn(p, 'isCurrent'))).toBe(true);
});

it('omits unrequested capabilities and unknown or inaccessible projects without names', async () => {
    const { deps, service } = fixture();
    deps.userModel.findSessionUserAndOrgByUuid.mockResolvedValue({
        ...defaultSessionUser,
        ability: new Ability([
            {
                action: 'view',
                subject: 'Project',
                conditions: { projectUuid: a },
            },
        ]),
    });
    const answer = await service.getReviewAnswer(account, {
        ...row,
        requested_projects: [a, b, 'unknown'],
        requested_capabilities: [C.Query],
    });
    expect(answer).toEqual([
        {
            projectUuid: a,
            name: 'A',
            selectable: true,
            reason: null,
            capabilities: [
                {
                    capability: C.Query,
                    visibility: 'offered',
                    reasonCode: null,
                    reason: null,
                },
            ],
        },
    ]);
    expect(JSON.stringify(answer)).not.toContain('unknown');
    expect(
        deps.reviewModel.getScheduledRefreshProjectUuids,
    ).toHaveBeenCalledWith([a]);
});

it('checks request ownership before disclosing projects', async () => {
    const { deps, service } = fixture();
    await expect(
        service.getReviewAnswer(account, {
            ...row,
            subject_user_uuid: 'someone-else',
        }),
    ).rejects.toMatchObject({ code: 'approval_forbidden' });
    expect(deps.projectModel.getAllByOrganizationUuid).not.toHaveBeenCalled();
});

it('caps visible projects at 500 before evaluating', async () => {
    const { deps, service } = fixture();
    deps.projectModel.getAllByOrganizationUuid.mockResolvedValue(
        Array.from({ length: 501 }, (_, i) => ({
            projectUuid: `${i}`,
            name: `${i}`,
        })),
    );
    await expect(service.getReviewAnswer(account, row)).rejects.toMatchObject({
        code: 'too_many_projects',
    });
    expect(
        deps.agentPermissionService.evaluateOperations,
    ).not.toHaveBeenCalled();
    deps.projectModel.getAllByOrganizationUuid.mockResolvedValue(
        Array.from({ length: 500 }, (_, i) => ({
            projectUuid: `${i}`,
            name: `${i}`,
        })),
    );
    expect(await service.getReviewAnswer(account, row)).toHaveLength(500);
});

it('reloads the person and narrows the answer after access is lost', async () => {
    const { deps, service } = fixture();
    expect(await service.getReviewAnswer(account, row)).toHaveLength(2);
    deps.userModel.findSessionUserAndOrgByUuid.mockResolvedValue({
        ...defaultSessionUser,
        ability: new Ability([
            {
                action: 'view',
                subject: 'Project',
                conditions: { projectUuid: b },
            },
        ]),
    });
    expect(
        (await service.getReviewAnswer(account, row)).map((p) => p.projectUuid),
    ).toEqual([b]);
    expect(deps.userModel.findSessionUserAndOrgByUuid).toHaveBeenCalledTimes(2);
});

it.each([
    [
        'agent_admission',
        AiAccessRefusalReason.AGENT_USER_NOT_ALLOWED,
        'organization_setting',
        'This person is not allowed to use agents.',
    ],
    [
        'agent_enabled',
        AiAccessRefusalReason.AGENT_ACCESS_DISABLED,
        'organization_setting',
        'Agents are turned off for this organisation.',
    ],
    [
        'project_scope',
        AiAccessRefusalReason.AGENT_PROJECT_DENIED,
        'project_scope',
        'Agents are turned off for this project.',
    ],
] as const)(
    'keeps structurally refused projects visible: %s',
    async (kind, reason, policyLayer, sentence) => {
        const { deps, service } = fixture();
        deps.agentPermissionService.evaluateOperations.mockImplementation(
            async ({ operations }: AgentPermissionBulkArgs) =>
                operations.map(() => ({
                    ...refused,
                    kind,
                    reason,
                    policyLayer,
                })),
        );
        const answer = await service.getReviewAnswer(account, {
            ...row,
            requested_capabilities: [],
        });
        expect(
            answer.map((p) => [p.selectable, p.reason, p.capabilities]),
        ).toEqual([
            [false, sentence, []],
            [false, sentence, []],
        ]);
    },
);

it('blocks the contract-derived Deploy and Administration capabilities for scheduled refresh and keeps the project selectable', async () => {
    const { deps, service } = fixture();
    deps.reviewModel.getScheduledRefreshProjectUuids.mockResolvedValue([a]);
    const answer = await service.getReviewAnswer(account, row);
    expect(answer[0].selectable).toBe(true);
    expect(capability(answer[0], C.DeployUpload)).toEqual({
        capability: C.DeployUpload,
        visibility: 'blocked',
        reasonCode: 'scheduled_pre_aggregate_refresh',
        reason: 'Not available while this project has a scheduled pre-aggregate refresh.',
    });
    expect(capability(answer[0], C.Query).visibility).toBe('offered');
    expect(capability(answer[0], C.Administration).reasonCode).toBe(
        'scheduled_pre_aggregate_refresh',
    );
    expect(capability(answer[1], C.DeployUpload).visibility).toBe('offered');
});

it.each(['throws', 'missing'] as const)(
    'fails closed when evaluation %s',
    async (failure) => {
        const { deps, service } = fixture();
        if (failure === 'throws')
            deps.agentPermissionService.evaluateOperations.mockRejectedValue(
                new Error('private detail'),
            );
        else
            deps.agentPermissionService.evaluateOperations.mockResolvedValue(
                [],
            );
        const answer = await service.getReviewAnswer(account, row);
        expect(
            answer
                .flatMap((p) => p.capabilities)
                .filter((c) => c.visibility !== 'hidden')
                .every(
                    (c) =>
                        c.visibility === 'blocked' &&
                        c.reasonCode === 'unavailable',
                ),
        ).toBe(true);
        expect(JSON.stringify(answer)).not.toContain('private detail');
    },
);

it('requires the upload and source effect permissions as well as the base operation', async () => {
    const { deps, service } = fixture();
    deps.agentPermissionService.evaluateOperations.mockImplementation(
        async ({ operations }: AgentPermissionBulkArgs) =>
            operations.map((op) =>
                op.kind === 'capability' && op.key === C.Publish
                    ? refused
                    : null,
            ),
    );
    const answer = await service.getReviewAnswer(account, row);
    expect(capability(answer[0], C.Publish).visibility).toBe('blocked');
    expect(capability(answer[0], C.RawSql).visibility).toBe('offered');
    expect(
        deps.agentPermissionService.evaluateOperations.mock.calls[0][0]
            .operations,
    ).toEqual(
        expect.arrayContaining([
            expect.objectContaining({ kind: 'capability', key: C.RawSql }),
            expect.objectContaining({
                kind: 'capability',
                key: C.DeployUpload,
            }),
            expect.objectContaining({ kind: 'capability', key: C.Publish }),
        ]),
    );
});

const project = (projectUuid: string, offered: C[]): ApprovalProject => ({
    projectUuid,
    name: projectUuid,
    selectable: true,
    reason: null,
    capabilities: offered.map((c) => ({
        capability: c,
        visibility: 'offered',
        reasonCode: null,
        reason: null,
    })),
});
const selection = () => ({
    requested: { projects: null, capabilities: [C.Query, C.DeployUpload] },
    displayed: [project(a, [C.Query]), project(b, [C.DeployUpload])],
    current: [project(a, [C.Query]), project(b, [C.DeployUpload])],
    selectedProjects: [a, b],
    selectedCapabilities: [C.Query, C.DeployUpload],
});

it('seals per-project intersections in a valid version-two map, never a cross product', () => {
    const result = sealSelection(selection());
    expect(result).toMatchObject({
        changed: false,
        selection: {
            approvedProjectUuids: [a, b],
            approvedCapabilities: [C.Query, C.DeployUpload],
            resourceConstraints: {
                version: 2,
                projectCapabilities: { [a]: [C.Query], [b]: [C.DeployUpload] },
            },
        },
    });
    expect(parseGrantResourceConstraints(result.selection!)).toEqual(
        result.selection!.resourceConstraints,
    );
});
it('caps later growth at the displayed answer', () => {
    const result = sealSelection({
        ...selection(),
        current: [
            project(a, [C.Query, C.DeployUpload]),
            project(b, [C.Query, C.DeployUpload]),
        ],
    });
    expect(result.changed).toBe(false);
    expect(result.selection?.resourceConstraints.projectCapabilities).toEqual({
        [a]: [C.Query],
        [b]: [C.DeployUpload],
    });
});
it('reports shrink for renewed review and returns the narrowed intersection', () => {
    const result = sealSelection({
        ...selection(),
        current: [project(a, []), project(b, [C.DeployUpload])],
    });
    expect(result.changed).toBe(true);
    expect(result.selection?.resourceConstraints.projectCapabilities).toEqual({
        [a]: [],
        [b]: [C.DeployUpload],
    });
});
it('reports a lost or structurally refused selected project without sealing it', () => {
    expect(
        sealSelection({
            ...selection(),
            current: [project(b, [C.DeployUpload])],
        }),
    ).toMatchObject({ changed: true, selection: null });
    expect(
        sealSelection({
            ...selection(),
            current: [
                { ...project(a, [C.Query]), selectable: false },
                project(b, [C.DeployUpload]),
            ],
        }),
    ).toMatchObject({ changed: true, selection: null });
});
it('allows empty capability selection without adding Read', () => {
    const result = sealSelection({ ...selection(), selectedCapabilities: [] });
    expect(result.selection?.approvedCapabilities).toEqual([]);
    expect(result.selection?.resourceConstraints.projectCapabilities).toEqual({
        [a]: [],
        [b]: [],
    });
    expect(parseGrantResourceConstraints(result.selection!)).not.toBeNull();
});
it.each([
    { selectedProjects: [] },
    { selectedProjects: [a, a] },
    { selectedProjects: ['unknown'] },
    { selectedCapabilities: [C.Export] },
    { selectedCapabilities: [C.Query, C.Query] },
    { requested: { projects: [a], capabilities: [C.Query, C.DeployUpload] } },
    {
        displayed: [
            { ...project(a, []), selectable: false },
            project(b, [C.DeployUpload]),
        ],
    },
])('rejects invalid or widened selections: %j', (override) => {
    expect(() => sealSelection({ ...selection(), ...override })).toThrow();
});

it('reports unavailable when one candidate is undetermined and the rest are refused', async () => {
    const { deps, service } = fixture();
    deps.agentPermissionService.evaluateOperations.mockImplementation(
        async ({ operations }: AgentPermissionBulkArgs) =>
            operations.map((op) =>
                op.key === 'QueryController.executeAsyncMetricQuery'
                    ? undefined
                    : refused,
            ),
    );
    const answer = await service.getReviewAnswer(account, row);
    expect(capability(answer[0], C.Query).reasonCode).toBe('unavailable');
});

it('fails closed only for scheduled-refresh capabilities when their source cannot be read', async () => {
    const { deps, service } = fixture();
    deps.reviewModel.getScheduledRefreshProjectUuids.mockRejectedValue(
        new Error('unavailable source'),
    );
    const answer = await service.getReviewAnswer(account, row);
    expect(capability(answer[0], C.DeployUpload).reasonCode).toBe(
        'unavailable',
    );
    expect(capability(answer[0], C.Administration).reasonCode).toBe(
        'unavailable',
    );
    expect(capability(answer[0], C.Query).visibility).toBe('offered');
});

it.each([
    [
        AiAccessRefusalReason.AGENT_SETTING_DENIED,
        'organization_setting',
        'action_disabled',
        'This action is turned off for agents.',
    ],
    [
        AiAccessRefusalReason.AGENT_CAPABILITY_DENIED,
        'organization_setting',
        'action_disabled',
        'This action is turned off for agents.',
    ],
    [
        AiAccessRefusalReason.AGENT_OPERATION_UNMAPPED,
        'unmapped',
        'unavailable',
        'The available permissions could not be checked.',
    ],
] as const)(
    'maps refusal %s at %s without product names',
    async (reason, policyLayer, reasonCode, sentence) => {
        const { deps, service } = fixture();
        deps.agentPermissionService.evaluateOperations.mockImplementation(
            async ({ operations }: AgentPermissionBulkArgs) =>
                operations.map(() => ({ ...refused, reason, policyLayer })),
        );
        const answer = await service.getReviewAnswer(account, row);
        expect(capability(answer[0], C.Query)).toMatchObject({
            visibility: 'blocked',
            reasonCode,
            reason: sentence,
        });
    },
);
