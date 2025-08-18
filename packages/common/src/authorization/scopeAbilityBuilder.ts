import { Ability, AbilityBuilder } from '@casl/ability';
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
        const conditionsList = scope.getConditions
            ? scope.getConditions(context)
            : [];

        // Apply each condition set
        conditionsList.forEach((conditions) => {
            builder.can(action, subject, conditions);
        });
    });

    handlePatConfigApplication(context, builder);
};

type BuilderOptions = {
    organizationUuid: string;
    projectUuid: string;
    userUuid?: string;
    scopes: string[];
    isEnterprise: boolean;
    organizationRole: string;
    permissionsConfig?: {
        pat: {
            enabled: boolean;
            allowedOrgRoles: string[];
        };
    };
};

/**
 * Build a complete CASL ability from scope names and context
 * @param context - Context containing organization, project, user, and space access information
 * @returns CASL Ability with applied permissions
 */
export const buildAbilityFromScopes = (
    context: BuilderOptions,
): MemberAbility => {
    const builder = new AbilityBuilder<MemberAbility>(Ability);

    const scopes = parseScopes({
        scopes: context.scopes,
        isEnterprise: context.isEnterprise,
    });
    const parsedContext = {
        ...context,
        scopes,
    };

    applyScopeAbilities(parsedContext, builder);
    return builder.build();
};
