import { type AbilityBuilder } from '@casl/ability';
import { type MemberAbility } from './types';

/**
 * Flattens built rules into their `action:Subject` permission names.
 * Conditions are intentionally omitted: the resulting unmodified permission is
 * conservative when compared with a caller's scopes.
 */
export const getPermissionsFromAbilityRules = (
    rules: AbilityBuilder<MemberAbility>['rules'],
): string[] => [
    ...new Set(
        rules.flatMap((rule) => {
            const actions = Array.isArray(rule.action)
                ? rule.action
                : [rule.action];
            const subjects = Array.isArray(rule.subject)
                ? rule.subject
                : [rule.subject];
            return actions.flatMap((action) =>
                subjects.map((ruleSubject) => `${action}:${ruleSubject}`),
            );
        }),
    ),
];
