import { Ability } from '@casl/ability';
import {
    CaslSubjectNames,
    MemberAbility,
    PossibleAbilities,
} from '@lightdash/common';
import Logger from '../../logging/logger';
import { scopesForOAuthRecord } from './mode';
import { OAUTH_OPERATIONS, oauthScopeAllows } from './scopeMap';

export type OAuthScopePolicy = {
    getRequest: () => { method: string | null; routeTemplate: string | null };
};

export type OAuthScopeContext = {
    clientId: string;
    scopes: string[];
    record: (
        action: string,
        subjectType: string,
        toolName: string | null,
    ) => void;
};

type OAuthRequestContext = {
    scope: OAuthScopeContext;
    recordOnce: (key: (string | null)[], record: () => void) => void;
};

const contexts = new WeakMap<MemberAbility, OAuthRequestContext>();

export const getOAuthScopeContext = (
    ability: MemberAbility,
): OAuthScopeContext | null => contexts.get(ability)?.scope ?? null;

export const recordOAuthRefusalOnce = (
    ability: MemberAbility,
    key: (string | null)[],
    record: () => void,
): void => {
    const context = contexts.get(ability);
    if (context) context.recordOnce(key, record);
    else record();
};

const buildScopedRules = (
    base: MemberAbility,
    scopes: string[],
): MemberAbility['rules'] =>
    base.rules.flatMap((rule) => {
        const actions = Array.isArray(rule.action)
            ? rule.action
            : [rule.action];
        const subjects = Array.isArray(rule.subject)
            ? rule.subject
            : [rule.subject];
        return Object.entries(OAUTH_OPERATIONS).flatMap(
            ([subjectType, classifiedActions]) => {
                if (
                    !subjects.includes('all') &&
                    !subjects.includes(subjectType as CaslSubjectNames)
                )
                    return [];
                return classifiedActions
                    .filter(
                        (action) =>
                            (actions.includes('manage') ||
                                actions.includes(action)) &&
                            (rule.inverted ||
                                oauthScopeAllows(scopes, action, subjectType)),
                    )
                    .map((action) => ({
                        ...rule,
                        action,
                        subject: subjectType as CaslSubjectNames,
                    }));
            },
        );
    });

class OAuthScopedAbility extends Ability<PossibleAbilities> {
    constructor(
        private readonly base: MemberAbility,
        private readonly scoped: MemberAbility,
        private readonly context: OAuthScopeContext,
    ) {
        super(scoped.rules, { anyAction: '__oauth_wildcard_disabled__' });
    }

    relevantRuleFor(...args: Parameters<MemberAbility['relevantRuleFor']>) {
        const baseRule = this.base.relevantRuleFor(...args);
        const scopedRule = this.scoped.relevantRuleFor(...args);
        if (
            baseRule &&
            !baseRule.inverted &&
            (!scopedRule || scopedRule.inverted)
        ) {
            this.context.record(
                args[0],
                String(this.base.detectSubjectType(args[1])),
                null,
            );
        }
        return scopedRule;
    }
}

export const createOAuthScopedAbility = (
    base: MemberAbility,
    {
        scopes,
        clientId,
        getRequest,
    }: OAuthScopePolicy & { scopes: string[]; clientId: string },
): MemberAbility => {
    const recorded = new Set<string>();
    const recordOnce: OAuthRequestContext['recordOnce'] = (key, record) => {
        const serialized = JSON.stringify(key);
        if (recorded.has(serialized)) return;
        recorded.add(serialized);
        record();
    };
    const context: OAuthScopeContext = {
        clientId,
        scopes: [...scopes],
        record: (action, subjectType, toolName) => {
            recordOnce(
                ['oauth_scope_refusal', action, subjectType, toolName],
                () => {
                    const { method, routeTemplate } = getRequest();
                    Logger.warn('oauth_scope_refusal', {
                        mode: 'enforce',
                        clientId,
                        scopes: scopesForOAuthRecord(context.scopes),
                        method,
                        routeTemplate: toolName === null ? routeTemplate : null,
                        toolName,
                        action,
                        subjectType,
                    });
                },
            );
        },
    };
    const scoped = new Ability<PossibleAbilities>(
        buildScopedRules(base, scopes),
        {
            anyAction: '__oauth_wildcard_disabled__',
        },
    );
    const ability = new OAuthScopedAbility(base, scoped, context);
    contexts.set(ability, { scope: context, recordOnce });
    return ability;
};
