import { subject, type AbilityBuilder } from '@casl/ability';
import { type CreateEmbedJwt } from '../ee';
import type { OssEmbed } from '../types/auth';
import { ScopeGroup } from '../types/scopes';
import { parseScope } from './parseScopes';
import { getScopes } from './scopes';
import { type MemberAbility } from './types';

type EmbedPermissionContext = {
    embed: Pick<OssEmbed, 'organization' | 'projectUuid'>;
    embedWriteUserAbility?: MemberAbility;
};

// In default mode the JWT flag decides these, so the actor's grant is not imported.
const ROLES_MODE_ONLY_EMBED_SCOPES = new Set(['view:EmbedAiAgentDebug']);

/** Project only embed capabilities, never the actor's regular-app abilities. */
export const applyEmbedScopeAbilities = ({
    embedUser,
    embed,
    embedWriteUserAbility,
    builder,
}: EmbedPermissionContext & {
    embedUser: CreateEmbedJwt;
    builder: Pick<AbilityBuilder<MemberAbility>, 'can'>;
}): void => {
    if (!embedUser.writeActions || !embedWriteUserAbility) return;
    if (
        embedUser.content.type === 'dashboard' &&
        embedUser.writeActions.permissionsMode !== 'roles'
    )
        return;

    const target = {
        organizationUuid: embed.organization.organizationUuid,
        projectUuid: embed.projectUuid,
    };

    const isRolesMode = embedUser.writeActions.permissionsMode === 'roles';
    getScopes({ isEnterprise: true })
        .filter(
            (scope) =>
                scope.group === ScopeGroup.EMBED &&
                (isRolesMode || !ROLES_MODE_ONLY_EMBED_SCOPES.has(scope.name)),
        )
        .forEach((scope) => {
            const [action, resource] = parseScope(scope.name);
            if (
                embedWriteUserAbility.can(
                    action,
                    subject(resource, { ...target }),
                )
            ) {
                builder.can(action, resource, target);
            }
        });
};
