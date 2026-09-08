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

    getScopes({ isEnterprise: true })
        .filter((scope) => scope.group === ScopeGroup.EMBED)
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
