import { camelCase, upperFirst } from 'lodash';
import { ParameterError } from '../types/errors';
import { type ScopeName } from '../types/scopes';
import { getAllScopeMap } from './scopes';
import { type AbilityAction, type CaslSubjectNames } from './types';

export const parseScope = (
    scope: string,
): [AbilityAction, CaslSubjectNames] => {
    const [action, subjectPart] = scope.split(':');
    const subject = upperFirst(camelCase(subjectPart));

    return [action as AbilityAction, subject as CaslSubjectNames];
};

export const parseScopes = ({
    scopes,
    isEnterprise,
}: {
    scopes: string[];
    isEnterprise: boolean;
}): Set<ScopeName> => {
    const scopeMap = getAllScopeMap({ isEnterprise });
    const filtered = scopes
        .map((scope) => parseScope(scope).join(':') as ScopeName)
        .filter((scope) => {
            const foundScope = scopeMap[scope];

            if (!foundScope) {
                throw new ParameterError(
                    `Invalid scope: ${scope}. Please check the scope name and try again.`,
                );
            }

            return true;
        });

    return new Set(filtered);
};
