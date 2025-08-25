import { type AbilityBuilder } from '@casl/ability';
import { type ScopeContext } from '../types/scopes';
import { parseScope, parseScopes } from './parseScopes';
import { getAllScopeMap } from './scopes';
import { type MemberAbility } from './types';

const handlePatConfigApplication = (
    context: ScopeContext,
    builder: AbilityBuilder<MemberAbility>,
) => {
    const { pat } = context?.permissionsConfig || {};
    const hasPatRule = builder.rules.find(
        (rule) =>
            rule.action === 'manage' && rule.subject === 'PersonalAccessToken',
    );

    if (
        !hasPatRule &&
        pat?.enabled &&
        context.organizationRole &&
        pat?.allowedOrgRoles?.includes(context.organizationRole)
    ) {
        builder.can('manage', 'PersonalAccessToken');
    }
};

/**
 * Apply scope-based abilities to a CASL ability builder
 * @param scopeNames - Array of scope names to apply
 * @param context - Context containing organization, project, user, and space access information
 * @param builder - CASL ability builder to add permissions to
 */
const applyScopeAbilities = (
    context: ScopeContext,
    builder: AbilityBuilder<MemberAbility>,
): void => {
    const scopeMap = getAllScopeMap({ isEnterprise: context.isEnterprise });

    context.scopes.forEach((scopeName) => {
        const scope = scopeMap[scopeName];

        if (!scope) return;

        const [action, subject] = parseScope(scopeName);
        const conditionsList = scope.getConditions(context);

        // Apply each condition set if there are any
        if (conditionsList.length === 0) {
            builder.can(action, subject);
        } else {
            conditionsList.forEach((conditions) => {
                builder.can(action, subject, conditions);
            });
        }
    });

    handlePatConfigApplication(context, builder);
};

type OptionalIdContext =
    | {
          organizationUuid: string;
          projectUuid?: never;
      }
    | {
          projectUuid: string;
          organizationUuid?: never;
      };

type BuilderOptions = {
    userUuid: string;
    scopes: string[];
    isEnterprise: boolean | undefined;
    organizationRole?: string;
    permissionsConfig?: {
        pat: {
            enabled: boolean;
            allowedOrgRoles: string[];
        };
    };
} & OptionalIdContext;

/**
 * Apply CASL abilities from scopes to a builder
 * @param context - Context containing organization, project, user, and space access information
 * @param builder - CASL ability builder to add permissions to
 */
export const buildAbilityFromScopes = (
    context: BuilderOptions,
    builder: AbilityBuilder<MemberAbility>,
): void => {
    const isEnterprise = context.isEnterprise ?? false;
    const scopes = parseScopes({
        scopes: context.scopes,
        isEnterprise,
    });
    const parsedContext = {
        ...context,
        scopes,
        isEnterprise,
    };

    applyScopeAbilities(parsedContext, builder);
};
