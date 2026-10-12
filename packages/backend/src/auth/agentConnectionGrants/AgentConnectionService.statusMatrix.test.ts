import { Ability } from '@casl/ability';
import {
    AgentCapability as C,
    type AbilityAction,
    type CaslSubjectNames,
} from '@lightdash/common';
import { fromSession } from '../account/account';
import { AgentConnectionService } from './AgentConnectionService';
import { managedExecutionFixture } from './managedExecution.mock';

const permissionCases: [AbilityAction, CaslSubjectNames, C[]][] = [
    ['view', 'Project', [C.ReadDiscover]],
    ['view', 'Explore', [C.Query]],
    ['manage', 'SqlRunner', [C.RawSql]],
    ...(['SavedChart', 'Dashboard', 'Document', 'DataApp'] as const).flatMap(
        (resource): [AbilityAction, CaslSubjectNames, C[]][] => [
            ['create', resource, [C.ContentWrite]],
            ['delete', resource, [C.Delete]],
        ],
    ),
    ['promote', 'SavedChart', [C.Publish]],
    ['promote', 'Dashboard', [C.Publish]],
    ['manage', 'ContentVerification', [C.Publish]],
    ['create', 'ScheduledDeliveries', [C.Publish]],
    ['manage', 'DeployProject', [C.DeployUpload]],
    ['manage', 'CompileProject', [C.DeployUpload]],
    ['manage', 'SourceCode', [C.DbtWriteback]],
    ['manage', 'ExportCsv', [C.Export]],
    ['manage', 'Project', [C.ReadDiscover, C.Administration]],
    ['manage', 'Organization', [C.Administration]],
    ['view', 'ExternalConnection', [C.ExternalTools]],
];

it.each(permissionCases)(
    'pins the complete status response for %s %s before permission extraction',
    async (action, resource, permitted) => {
        const f = managedExecutionFixture();
        f.user.ability = new Ability([
            { action: 'view', subject: 'Project' },
            {
                action,
                subject: resource,
                conditions:
                    resource === 'Organization'
                        ? { organizationUuid: f.grant.organizationUuid }
                        : { projectUuid: f.projectUuid },
            },
        ]);
        const service = new AgentConnectionService({
            model: {
                find: vi.fn().mockResolvedValue(f.grant),
                listForSubject: vi.fn(),
                revoke: vi.fn(),
            },
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
        });
        const unsupported = [C.DbtWriteback, C.Export, C.ExternalTools];
        expect(
            await service.status(fromSession(f.user, ''), f.grant.grantUuid),
        ).toEqual({
            grantUuid: f.grant.grantUuid,
            name: f.grant.name,
            clientId: f.grant.clientId,
            limitsStatus: 'ok',
            approvedProjects: [
                {
                    projectUuid: f.projectUuid,
                    name: 'Visible project',
                    approvedCapabilities: Object.values(C),
                },
            ],
            approvedAt: f.grant.approvedAt,
            expiresAt: f.grant.expiresAt,
            lastUsedAt: null,
            status: 'active',
            revokedAt: null,
            effectiveProjects: [
                {
                    projectUuid: f.projectUuid,
                    capabilities: Object.values(C).map((capability) => {
                        const personAllowed =
                            capability === C.ReadDiscover ||
                            permitted.includes(capability);
                        let reason: string | null = null;
                        if (!personAllowed) reason = 'person_permission';
                        else if (unsupported.includes(capability))
                            reason = 'not_supported';
                        return { capability, allowed: reason === null, reason };
                    }),
                },
            ],
        });
    },
);
