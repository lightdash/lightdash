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

export const parseScopes = ({
    scopes,
    isEnterprise,
}: {
    scopes: string[];
    isEnterprise: boolean;
}): Set<ScopeName> => {
    const scopeMap = getAllScopeMap({ isEnterprise });
    const filtered = scopes.map(normalizeScopeName).filter((scope) => {
        const foundScope = scopeMap[scope as ScopeName];

        if (!foundScope) {
            // eslint-disable-next-line no-console
            console.warn(
                `Invalid scope: ${scope}. Please check the scope name and try again.`,
            );
            return false;
        }

        return true;
    });

    return new Set(filtered);
};
