/**
 * Who can query a live data source, as user attribute conditions. The rule is
 * copied onto each of the source's explores (`required_attributes` and
 * `any_attributes` on the base table), so every explore check applies it.
 * Empty conditions mean everyone who can query the project can query it.
 */
export type LiveSourceAccessRule = {
    /** Every attribute must match one of its values. */
    required: Record<string, string[]>;
    /** At least one attribute must match one of its values. */
    any: Record<string, string[]>;
};

export const EMPTY_LIVE_SOURCE_ACCESS_RULE: LiveSourceAccessRule = {
    required: {},
    any: {},
};

export const isLiveSourceAccessRuleEmpty = (rule: LiveSourceAccessRule) =>
    Object.keys(rule.required).length === 0 &&
    Object.keys(rule.any).length === 0;

/** Whether someone with these attribute values passes the rule; an empty rule lets everyone in. */
export const matchesLiveSourceAccessRule = (
    rule: LiveSourceAccessRule,
    attributes: Record<string, string[]>,
) => {
    const matches = ([name, values]: [string, string[]]) =>
        values.some((value) => attributes[name]?.includes(value) ?? false);
    const anyConditions = Object.entries(rule.any);
    return (
        Object.entries(rule.required).every(matches) &&
        (anyConditions.length === 0 || anyConditions.some(matches))
    );
};

/** A live data source's access rule, with what the people who manage it need to edit it. */
export type LiveSourceAccess = LiveSourceAccessRule & {
    /** The organization's user attributes, which conditions can name. */
    attributeNames: string[];
    /** The caller's own attribute values, to warn before a rule locks them out. */
    yourAttributes: Record<string, string[]>;
};

export type ApiLiveSourceAccessResponse = {
    status: 'ok';
    results: LiveSourceAccess;
};
