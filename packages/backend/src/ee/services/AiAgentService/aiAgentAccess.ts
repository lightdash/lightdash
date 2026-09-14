import { subject, type Ability } from '@casl/ability';
import { type AiAgent, type SessionUser } from '@lightdash/common';
import { type CaslAuditWrapper } from '../../../logging/caslAuditWrapper';
import { type GroupsModel } from '../../../models/GroupsModel';

type AccessDependencies = {
    auditedAbility: CaslAuditWrapper<Ability>;
    groupsModel: Pick<GroupsModel, 'findUserInGroups'>;
};

export const canAccessAiAgent = async (
    user: SessionUser,
    agent: AiAgent,
    { auditedAbility, groupsModel }: AccessDependencies,
): Promise<boolean> => {
    if (
        auditedAbility.can(
            'manage',
            subject('AiAgent', {
                organizationUuid: agent.organizationUuid,
                projectUuid: agent.projectUuid,
                metadata: {
                    agentUuid: agent.uuid,
                    agentName: agent.name,
                },
            }),
        )
    ) {
        return true;
    }

    if (agent.adminOnly) return false;

    const hasGroupAccess = agent.groupAccess.length > 0;
    const hasUserAccess = agent.userAccess.length > 0;
    if (!hasGroupAccess && !hasUserAccess) {
        return auditedAbility.can(
            'view',
            subject('Project', {
                organizationUuid: agent.organizationUuid,
                projectUuid: agent.projectUuid,
            }),
        );
    }

    if (hasUserAccess && agent.userAccess.includes(user.userUuid)) return true;
    if (!hasGroupAccess) return false;

    const userGroups = await groupsModel.findUserInGroups({
        userUuid: user.userUuid,
        organizationUuid: agent.organizationUuid,
        groupUuids: agent.groupAccess,
    });
    return userGroups.length > 0;
};

export const canAccessAiAgentThread = async (
    user: SessionUser,
    agent: AiAgent,
    threadUserUuid: string,
    dependencies: AccessDependencies,
): Promise<boolean> => {
    if (!(await canAccessAiAgent(user, agent, dependencies))) return false;
    if (threadUserUuid === user.userUuid) return true;

    return dependencies.auditedAbility.can(
        'manage',
        subject('AiAgent', {
            organizationUuid: agent.organizationUuid,
            projectUuid: agent.projectUuid,
            metadata: {
                agentUuid: agent.uuid,
                agentName: agent.name,
            },
        }),
    );
};
