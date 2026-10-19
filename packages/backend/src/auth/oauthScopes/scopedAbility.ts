import { Ability } from '@casl/ability';
import {
    CaslSubjectNames,
    MemberAbility,
    PossibleAbilities,
} from '@lightdash/common';
import Logger from '../../logging/logger';
import { OAuthScopeMode, scopesForOAuthRecord } from './mode';
import { OAUTH_OPERATIONS, oauthScopeAllows } from './scopeMap';

export type OAuthScopePolicy = {
    mode: OAuthScopeMode;
    getRequest: () => { method: string | null; routeTemplate: string | null };
};

export type OAuthScopeContext = {
    mode: OAuthScopeMode;
    scopes: string[];
    record: (
        action: string,
        subjectType: string,
        toolName: string | null,
    ) => void;
};

const contexts = new WeakMap<MemberAbility, OAuthScopeContext>();

export const getOAuthScopeContext = (
    ability: MemberAbility,
): OAuthScopeContext | null => contexts.get(ability) ?? null;

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
        super(context.mode === 'log' ? base.rules : scoped.rules, {
            anyAction:
                context.mode === 'log'
                    ? 'manage'
                    : '__oauth_wildcard_disabled__',
        });
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
        return this.context.mode === 'log' ? baseRule : scopedRule;
    }
}

export const createOAuthScopedAbility = (
    base: MemberAbility,
    {
        mode,
        scopes,
        clientId,
        getRequest,
    }: OAuthScopePolicy & { scopes: string[]; clientId: string },
): MemberAbility => {
    const recorded = new Set<string>();
    const context: OAuthScopeContext = {
        mode,
        scopes: [...scopes],
        record: (action, subjectType, toolName) => {
            const key = JSON.stringify([action, subjectType, toolName]);
            if (recorded.has(key)) return;
            recorded.add(key);
            const { method, routeTemplate } = getRequest();
            Logger.warn('oauth_scope_refusal', {
                mode,
                clientId,
                scopes: scopesForOAuthRecord(context.scopes),
                method,
                routeTemplate: toolName === null ? routeTemplate : null,
                toolName,
                action,
                subjectType,
            });
        },
    };
    const scoped = new Ability<PossibleAbilities>(
        buildScopedRules(base, scopes),
        {
            anyAction: '__oauth_wildcard_disabled__',
        },
    );
    const ability = new OAuthScopedAbility(base, scoped, context);
    contexts.set(ability, context);
    return ability;
};
