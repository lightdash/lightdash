import { subject } from '@casl/ability';
import {
    AgentActorSurface,
    AgentCapability,
    assertUnreachable,
    ForbiddenError,
    NotFoundError,
    type AgentConnectionGrant,
    type RegisteredAccount,
    type UUID,
} from '@lightdash/common';
import { type AgentConnectionGrantModel } from '../../models/AgentConnectionGrantModel';
import { type FeatureFlagModel } from '../../models/FeatureFlagModel/FeatureFlagModel';
import { type ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { type UserModel } from '../../models/UserModel';
import { type AgentPermissionService } from '../../services/AgentPermissionService/AgentPermissionService';
import { BaseService } from '../../services/BaseService';
import { fromSession } from '../account/account';
import { agentConnectionGrantEnabled } from './oauthGrantBinding';

export type AgentConnectionRecord = {
    grantUuid: UUID;
    name: string;
    clientId: string;
    approvedProjects: {
        projectUuid: UUID;
        name: string | null;
        approvedCapabilities: AgentCapability[];
    }[];
    approvedAt: Date;
    expiresAt: Date;
    lastUsedAt: Date | null;
    status: 'active' | 'expired' | 'revoked';
    revokedAt: Date | null;
};

export type AgentConnectionStatus = AgentConnectionRecord & {
    effectiveProjects: {
        projectUuid: UUID;
        capabilities: {
            capability: AgentCapability;
            allowed: boolean;
            reason:
                | 'revoked'
                | 'expired'
                | 'agent_identity_disabled'
                | 'project_access'
                | 'person_permission'
                | 'agent_policy'
                | null;
        }[];
    }[];
};

export class AgentConnectionService extends BaseService {
    constructor(
        private readonly deps: {
            model: Pick<
                AgentConnectionGrantModel,
                'find' | 'revoke' | 'listForSubject'
            >;
            userModel: Pick<UserModel, 'findSessionUserAndOrgByUuid'>;
            projectModel: Pick<ProjectModel, 'getAllByOrganizationUuid'>;
            featureFlags: Pick<FeatureFlagModel, 'get'>;
            getAgentPermissionService: () => Pick<
                AgentPermissionService,
                'assertOperation'
            >;
        },
    ) {
        super();
    }

    private static assertActor(
        account: RegisteredAccount,
        grantUuid: UUID | null,
    ): void {
        if (
            account.authentication.type === 'session' ||
            account.authentication.type === 'pat'
        )
            return;
        if (
            account.authentication.type === 'oauth' &&
            account.authentication.agentConnectionGrant &&
            grantUuid !== null
        ) {
            if (
                account.authentication.agentConnectionGrant.grantUuid !==
                grantUuid
            )
                throw new NotFoundError('Agent connection not found');
            return;
        }
        throw new ForbiddenError(
            'This operation requires a person or its own agent connection.',
        );
    }

    private async findOwned(
        account: RegisteredAccount,
        grantUuid: UUID,
    ): Promise<AgentConnectionGrant> {
        AgentConnectionService.assertActor(account, grantUuid);
        const grant = await this.deps.model.find(grantUuid);
        if (
            !grant ||
            grant.organizationUuid !== account.organization.organizationUuid ||
            grant.subjectUserUuid !== account.user.id
        )
            throw new NotFoundError('Agent connection not found');
        return grant;
    }

    private async freshPerson(
        account: RegisteredAccount,
    ): Promise<RegisteredAccount> {
        if (!account.organization.organizationUuid)
            throw new NotFoundError('Agent connection not found');
        const person = await this.deps.userModel.findSessionUserAndOrgByUuid(
            account.user.id,
            account.organization.organizationUuid,
        );
        if (
            !person.isActive ||
            person.userUuid !== account.user.id ||
            person.organizationUuid !== account.organization.organizationUuid
        )
            throw new ForbiddenError('This person is no longer available.');
        return fromSession(person, '');
    }

    private static getState(
        grant: AgentConnectionGrant,
    ): AgentConnectionRecord['status'] {
        if (grant.revokedAt !== null) return 'revoked';
        if (grant.expiresAt.getTime() <= Date.now()) return 'expired';
        return 'active';
    }

    private async records(
        account: RegisteredAccount,
        grants: AgentConnectionGrant[],
    ): Promise<AgentConnectionRecord[]> {
        const projects = await this.deps.projectModel.getAllByOrganizationUuid(
            account.organization.organizationUuid!,
        );
        const ability = this.createAuditedAbility(account);
        return grants.map((grant) => ({
            grantUuid: grant.grantUuid,
            name: grant.name,
            clientId: grant.clientId,
            approvedProjects: grant.approvedProjectUuids.map((projectUuid) => ({
                projectUuid,
                name: ability.can(
                    'view',
                    subject('Project', {
                        organizationUuid: grant.organizationUuid,
                        projectUuid,
                    }),
                )
                    ? (projects.find(
                          (project) => project.projectUuid === projectUuid,
                      )?.name ?? null)
                    : null,
                approvedCapabilities:
                    grant.resourceConstraints.version === 2
                        ? grant.resourceConstraints.projectCapabilities[
                              projectUuid
                          ]
                        : grant.approvedCapabilities,
            })),
            approvedAt: grant.approvedAt,
            expiresAt: grant.expiresAt,
            lastUsedAt: grant.lastUsedAt,
            status: AgentConnectionService.getState(grant),
            revokedAt: grant.revokedAt,
        }));
    }

    async list(account: RegisteredAccount): Promise<AgentConnectionRecord[]> {
        AgentConnectionService.assertActor(account, null);
        const person = await this.freshPerson(account);
        const grants = await this.deps.model.listForSubject({
            organizationUuid: person.organization.organizationUuid!,
            subjectUserUuid: person.user.id,
        });
        return this.records(person, grants);
    }

    async get(
        account: RegisteredAccount,
        grantUuid: UUID,
    ): Promise<AgentConnectionRecord> {
        const grant = await this.findOwned(account, grantUuid);
        const [record] = await this.records(await this.freshPerson(account), [
            grant,
        ]);
        return record;
    }

    private personAllowsCapability(
        account: RegisteredAccount,
        projectUuid: UUID,
        capability: AgentCapability,
    ): boolean {
        const ability = this.createAuditedAbility(account);
        const resource = {
            organizationUuid: account.organization.organizationUuid!,
            projectUuid,
        };
        const content = {
            ...resource,
            inheritsFromOrgOrProject: true,
            access: [],
        };
        switch (capability) {
            case AgentCapability.ReadDiscover:
                return ability.can('view', subject('Project', { ...resource }));
            case AgentCapability.Query:
                return ability.can('view', subject('Explore', { ...resource }));
            case AgentCapability.RawSql:
                return ability.can(
                    'manage',
                    subject('SqlRunner', { ...resource }),
                );
            case AgentCapability.ContentWrite:
                return (
                    ability.can(
                        'create',
                        subject('SavedChart', { ...content }),
                    ) ||
                    ability.can(
                        'create',
                        subject('Dashboard', { ...content }),
                    ) ||
                    ability.can(
                        'create',
                        subject('Document', { ...content }),
                    ) ||
                    ability.can('create', subject('DataApp', { ...content }))
                );
            case AgentCapability.Delete:
                return (
                    ability.can(
                        'delete',
                        subject('SavedChart', { ...content }),
                    ) ||
                    ability.can(
                        'delete',
                        subject('Dashboard', { ...content }),
                    ) ||
                    ability.can(
                        'delete',
                        subject('Document', { ...content }),
                    ) ||
                    ability.can('delete', subject('DataApp', { ...content }))
                );
            case AgentCapability.Publish:
                return (
                    ability.can(
                        'promote',
                        subject('SavedChart', { ...content }),
                    ) ||
                    ability.can(
                        'promote',
                        subject('Dashboard', { ...content }),
                    ) ||
                    ability.can(
                        'manage',
                        subject('ContentVerification', { ...resource }),
                    ) ||
                    ability.can(
                        'create',
                        subject('ScheduledDeliveries', { ...resource }),
                    )
                );
            case AgentCapability.DeployUpload:
                return (
                    ability.can(
                        'manage',
                        subject('DeployProject', { ...resource }),
                    ) ||
                    ability.can(
                        'manage',
                        subject('CompileProject', { ...resource }),
                    )
                );
            case AgentCapability.DbtWriteback:
                return ability.can(
                    'manage',
                    subject('SourceCode', {
                        ...resource,
                        isProtectedBranch: false,
                    }),
                );
            case AgentCapability.Export:
                return ability.can(
                    'manage',
                    subject('ExportCsv', { ...resource }),
                );
            case AgentCapability.Administration:
                return (
                    ability.can(
                        'manage',
                        subject('Project', { ...resource }),
                    ) ||
                    ability.can(
                        'manage',
                        subject('Organization', {
                            organizationUuid: resource.organizationUuid,
                        }),
                    )
                );
            case AgentCapability.ExternalTools:
                return ability.can(
                    'view',
                    subject('ExternalConnection', { ...resource }),
                );
            default:
                return assertUnreachable(
                    capability,
                    'Unknown agent capability',
                );
        }
    }

    async status(
        account: RegisteredAccount,
        grantUuid: UUID,
    ): Promise<AgentConnectionStatus> {
        const grant = await this.findOwned(account, grantUuid);
        const person = await this.freshPerson(account);
        const [record] = await this.records(person, [grant]);
        const enabled = await agentConnectionGrantEnabled(
            this.deps.featureFlags,
            {
                userUuid: grant.subjectUserUuid,
                organizationUuid: grant.organizationUuid,
            },
        );
        const ability = this.createAuditedAbility(person);
        const effectiveProjects = await Promise.all(
            record.approvedProjects.map(async (project) => ({
                projectUuid: project.projectUuid,
                capabilities: await Promise.all(
                    project.approvedCapabilities.map(async (capability) => {
                        let reason: AgentConnectionStatus['effectiveProjects'][number]['capabilities'][number]['reason'] =
                            null;
                        if (record.status !== 'active') reason = record.status;
                        else if (!enabled) reason = 'agent_identity_disabled';
                        else if (
                            project.name === null ||
                            !ability.can(
                                'view',
                                subject('Project', {
                                    projectUuid: project.projectUuid,
                                    organizationUuid: grant.organizationUuid,
                                }),
                            )
                        )
                            reason = 'project_access';
                        else if (
                            !this.personAllowsCapability(
                                person,
                                project.projectUuid,
                                capability,
                            )
                        )
                            reason = 'person_permission';
                        else {
                            try {
                                await this.deps
                                    .getAgentPermissionService()
                                    .assertOperation({
                                        account: person,
                                        organizationUuid:
                                            grant.organizationUuid,
                                        projectUuid: project.projectUuid,
                                        kind: 'capability',
                                        key: capability,
                                        surface: AgentActorSurface.CLI,
                                    });
                            } catch (error) {
                                if (!(error instanceof ForbiddenError))
                                    throw error;
                                reason = 'agent_policy';
                            }
                        }
                        return { capability, allowed: reason === null, reason };
                    }),
                ),
            })),
        );
        return { ...record, effectiveProjects };
    }

    async revoke({
        grantUuid,
        organizationUuid,
        actor,
        reason,
    }: {
        grantUuid: UUID;
        organizationUuid: UUID;
        actor: RegisteredAccount | null;
        reason: string;
    }): Promise<void> {
        const grant = actor
            ? await this.findOwned(actor, grantUuid)
            : await this.deps.model.find(grantUuid);
        if (
            !grant ||
            grant.organizationUuid !== organizationUuid ||
            (actor && actor.organization.organizationUuid !== organizationUuid)
        )
            throw new NotFoundError('Agent connection not found');
        await this.deps.model.revoke({
            grantUuid,
            organizationUuid,
            revokedByUserUuid: actor?.user.id ?? null,
            reason,
        });
    }
}
