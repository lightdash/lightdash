import { Ability, AbilityBuilder } from '@casl/ability';
import {
    buildAbilityFromScopes,
    type AiAgent,
    type MemberAbility,
} from '@lightdash/common';
import { defaultSessionUser } from '../../../auth/account/account.mock';
import { CaslAuditWrapper } from '../../../logging/caslAuditWrapper';
import { type GroupsModel } from '../../../models/GroupsModel';
import { canAccessAiAgent, canAccessAiAgentThread } from './aiAgentAccess';

const agent: AiAgent = {
    uuid: 'agent-uuid',
    projectUuid: 'project-uuid',
    organizationUuid: defaultSessionUser.organizationUuid!,
    integrations: [],
    tags: null,
    name: 'Agent',
    description: null,
    createdAt: new Date('2026-09-17'),
    updatedAt: new Date('2026-09-17'),
    instruction: null,
    imageUrl: null,
    imageUrlSource: null,
    groupAccess: [],
    userAccess: [],
    spaceAccess: [],
    enableDataAccess: true,
    enableSelfImprovement: false,
    enableContentTools: true,
    enableUserContext: true,
    enableSqlMode: true,
    adminOnly: false,
    modelConfig: null,
    version: 1,
    threadRetentionHours: null,
};

const buildDependencies = (
    scopes: string[],
    projectUuid = agent.projectUuid,
) => {
    const builder = new AbilityBuilder<MemberAbility>(Ability);
    buildAbilityFromScopes(
        {
            scopes,
            projectUuid,
            userUuid: defaultSessionUser.userUuid,
            isEnterprise: true,
        },
        builder,
    );
    return {
        auditedAbility: new CaslAuditWrapper(
            builder.build(),
            defaultSessionUser,
        ),
        groupsModel: {
            findUserInGroups: vi
                .fn<GroupsModel['findUserInGroups']>()
                .mockResolvedValue([]),
        },
    };
};

describe('AI agent access', () => {
    it('denies unrestricted agents to project viewers without AI Agent scopes', async () => {
        const dependencies = buildDependencies(['view:Project']);

        await expect(
            canAccessAiAgent(defaultSessionUser, agent, dependencies),
        ).resolves.toBe(false);
    });

    it.each(['view:AiAgent', 'manage:AiAgent'])(
        'allows unrestricted agents with %s only in the permitted project',
        async (scope) => {
            await expect(
                canAccessAiAgent(
                    defaultSessionUser,
                    agent,
                    buildDependencies([scope]),
                ),
            ).resolves.toBe(true);
            await expect(
                canAccessAiAgent(
                    defaultSessionUser,
                    agent,
                    buildDependencies([scope], 'other-project'),
                ),
            ).resolves.toBe(false);
        },
    );

    it.each([
        { scopes: ['view:Project'], allowed: false },
        { scopes: ['view:AiAgent'], allowed: true },
    ])(
        'requires agent access even for an owned thread ($scopes)',
        async ({ scopes, allowed }) => {
            await expect(
                canAccessAiAgentThread(
                    defaultSessionUser,
                    agent,
                    defaultSessionUser.userUuid,
                    buildDependencies(scopes),
                ),
            ).resolves.toBe(allowed);
        },
    );
});
