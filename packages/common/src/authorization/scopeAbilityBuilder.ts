import { type AbilityBuilder } from '@casl/ability';
import { type ProjectType } from '../types/projects';
import { type ScopeContext } from '../types/scopes';
import { parseScope, parseScopes } from './parseScopes';
import { getAllScopeMap } from './scopes';
import { type MemberAbility } from './types';

/**
 * Compatibility grant so a scope set doesn't strip already-granted PAT access.
 * Skipped for every set while the org's PAT opt-in is authoritative, applied otherwise.
 */
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
    applyPatConfigFallback: boolean,
): void => {
    const scopeMap = getAllScopeMap({ isEnterprise: context.isEnterprise });

    context.scopes.forEach((scopeName) => {
        const scope = scopeMap[scopeName];

        if (!scope) return;

        const [action, subject] = parseScope(scopeName);
        const conditionsList = scope.getConditions(context);

        // null = scope does not apply in this context (e.g. @self
        // outside a self-created preview project). Skip entirely — an empty
        // array still means an unconditional grant.
        if (conditionsList === null) return;

        // Apply each condition set if there are any
        if (conditionsList.length === 0) {
            builder.can(action, subject);
        } else {
            conditionsList.forEach((conditions) => {
                builder.can(action, subject, conditions);
            });
        }
    });

    if (applyPatConfigFallback) {
        handlePatConfigApplication(context, builder);
    }
};

type OptionalIdContext =
    | {
          organizationUuid: string;
          projectUuid?: never;
          projectType?: never;
          projectCreatedByUserUuid?: never;
      }
    | {
          projectUuid: string;
          organizationUuid?: never;
          projectType?: ProjectType;
          projectCreatedByUserUuid?: string | null;
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
    /**
     * Whether an omitted `manage:PersonalAccessToken` still inherits from config.
     * False for every set when the org opted into authoritative PAT scopes, true otherwise.
     */
    applyPatConfigFallback?: boolean;
} & OptionalIdContext;

/**
 * Apply CASL abilities from scopes to a builder. Returns the list of scope
 * names that were rejected because they are not in the runtime vocabulary so
 * the caller can log or report them with whatever logger it has on hand
 * (`parseScopes` itself is side-effect free — `common` can't depend on the
 * backend Winston logger).
 */
export const buildAbilityFromScopes = (
    context: BuilderOptions,
    builder: AbilityBuilder<MemberAbility>,
): string[] => {
    const { applyPatConfigFallback = true, ...scopeContext } = context;
    const isEnterprise = context.isEnterprise ?? false;
    const { valid, invalid } = parseScopes({
        scopes: context.scopes,
        isEnterprise,
    });
    const parsedContext = {
        ...scopeContext,
        scopes: valid,
        isEnterprise,
    };

    applyScopeAbilities(parsedContext, builder, applyPatConfigFallback);

    return invalid;
};
