import camelCase from 'lodash/camelCase';
import upperFirst from 'lodash/upperFirst';
import { type ScopeModifer, type ScopeName } from '../types/scopes';
import { getAllScopeMap } from './scopes';
import { type AbilityAction, type CaslSubjectNames } from './types';

export const parseScope = (
    scope: string,
): [AbilityAction, CaslSubjectNames, ScopeModifer | undefined] => {
    const [action, predicate] = scope.split(':');
    const [subjectPart, modifier] = predicate.split('@');
    const subject = upperFirst(camelCase(subjectPart));

    return [
        action as AbilityAction,
        subject as CaslSubjectNames,
        modifier as ScopeModifer,
    ];
};

export const normalizeScopeName = (scope: string): ScopeName => {
    const [action, subject, modifier] = parseScope(scope);
    return `${action}:${subject}${modifier ? `@${modifier}` : ''}` as ScopeName;
};

export type ParseScopesResult = {
    valid: Set<ScopeName>;
    invalid: string[];
};

export const parseScopes = ({
    scopes,
    isEnterprise,
}: {
    scopes: string[];
    isEnterprise: boolean;
}): ParseScopesResult => {
    const scopeMap = getAllScopeMap({ isEnterprise });
    const valid = new Set<ScopeName>();
    const invalid: string[] = [];

    scopes.forEach((rawScope) => {
        const normalized = normalizeScopeName(rawScope);
        if (scopeMap[normalized]) {
            valid.add(normalized);
        } else {
            invalid.push(normalized);
        }
    });

    return { valid, invalid };
};
