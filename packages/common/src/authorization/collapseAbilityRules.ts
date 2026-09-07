import { type RawRuleOf } from '@casl/ability';
import { type MemberAbility } from './types';

type MemberRule = RawRuleOf<MemberAbility>;
type Conditions = Record<string, unknown>;

// Deterministic stringify so condition key order never affects grouping.
const stableStringify = (value: unknown): string => {
    if (value === null || typeof value !== 'object') {
        return JSON.stringify(value);
    }
    if (Array.isArray(value)) {
        return `[${value.map(stableStringify).join(',')}]`;
    }
    const obj = value as Conditions;
    return `{${Object.keys(obj)
        .sort()
        .map((key) => `${JSON.stringify(key)}:${stableStringify(obj[key])}`)
        .join(',')}}`;
};

const isScalarString = (value: unknown): value is string =>
    typeof value === 'string';

/**
 * Collapses rules that are identical except for the value of a single scalar
 * condition (e.g. `projectUuid`, `upstreamProjectUuid`) into one rule with that
 * key as `{ $in: [...] }`, and drops exact duplicates.
 *
 * Only sound when the rule set contains NO inverted (`cannot`) rules: with only
 * positive rules, `can()` means "does any rule match", so both `$in` merging and
 * exact dedup are order-independent and decision-preserving. With an inverted
 * rule present, CASL is last-relevant-rule-wins, and removing or merging a
 * positive rule can flip a decision (e.g. a duplicate `can` after a `cannot` is
 * what re-grants access). In that case we return the rules untouched. Every
 * built-in role, custom-scope, and service-account builder emits only positive
 * rules (guarded by a test), so the large-permission-graph case this targets is
 * fully collapsed.
 *
 * Masking ALL scalar-string condition values when grouping is safe because a
 * single ability is built for one org and one user, so `organizationUuid`,
 * `userUuid`, `createdByUserUuid` and `type` are constants across the rule set —
 * the only scalar that varies is the per-project id. If that ever stops holding
 * (two scalars varying independently within a group), `varyingKeys.length > 1`
 * falls back to dedup-only and never produces a wrong `$in` merge.
 *
 * Decision-equivalence: `{ key: { $in: [a, b] } }` matches exactly the union of
 * `{ key: a }` and `{ key: b }` when every other condition is identical.
 */
export const collapseAbilityRules = (rules: MemberRule[]): MemberRule[] => {
    if (rules.some((rule) => rule.inverted)) {
        return rules;
    }

    // Group by "shape": action/subject/fields plus every condition with
    // scalar-string values masked out (keys kept). Rules sharing a shape differ
    // only in scalar-string condition values. Map preserves insertion order, so
    // first-occurrence order is preserved.
    const groups = new Map<string, MemberRule[]>();
    for (const rule of rules) {
        const conditions = rule.conditions as Conditions | undefined;
        const shape = conditions
            ? Object.fromEntries(
                  Object.keys(conditions).map((key) => [
                      key,
                      isScalarString(conditions[key]) ? null : conditions[key],
                  ]),
              )
            : null;
        const groupKey = stableStringify([
            rule.action,
            rule.subject,
            rule.fields ?? null,
            shape,
        ]);
        const existing = groups.get(groupKey);
        if (existing) {
            existing.push(rule);
        } else {
            groups.set(groupKey, [rule]);
        }
    }

    return [...groups.values()].flatMap((group) => {
        const [first, ...rest] = group;
        if (rest.length === 0) {
            return [first];
        }

        const firstConditions = first.conditions as Conditions | undefined;
        // No conditions → grouped rules are exact duplicates.
        if (!firstConditions) {
            return [first];
        }

        // Which scalar-string keys actually vary across the group?
        const varyingKeys = Object.keys(firstConditions).filter(
            (key) =>
                isScalarString(firstConditions[key]) &&
                group.some(
                    (rule) =>
                        (rule.conditions as Conditions)[key] !==
                        firstConditions[key],
                ),
        );

        if (varyingKeys.length === 0) {
            return [first]; // all duplicates
        }
        if (varyingKeys.length > 1) {
            // More than one scalar varies independently — a single $in cannot
            // represent the combinations, so only dedup exact duplicates.
            const seen = new Set<string>();
            return group.filter((rule) => {
                const id = stableStringify(rule.conditions ?? null);
                if (seen.has(id)) {
                    return false;
                }
                seen.add(id);
                return true;
            });
        }

        const [mergeKey] = varyingKeys;
        const values = [
            ...new Set(
                group.map(
                    (rule) =>
                        (rule.conditions as Conditions)[mergeKey] as string,
                ),
            ),
        ].sort();
        return [
            {
                ...first,
                conditions: { ...firstConditions, [mergeKey]: { $in: values } },
            },
        ];
    });
};
