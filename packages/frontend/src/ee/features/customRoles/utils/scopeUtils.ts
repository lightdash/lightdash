import { getScopes, ScopeGroup, type Scope } from '@lightdash/common';
import startCase from 'lodash/startCase';

const GROUP_DISPLAY_NAMES: Record<ScopeGroup, string> = {
    [ScopeGroup.CONTENT]: 'Content Management',
    [ScopeGroup.PROJECT_MANAGEMENT]: 'Project Management',
    [ScopeGroup.ORGANIZATION_MANAGEMENT]: 'Organization Management',
    [ScopeGroup.DATA]: 'Data Access',
    [ScopeGroup.SHARING]: 'Sharing & Export',
    [ScopeGroup.AI]: 'AI Features',
    [ScopeGroup.SPOTLIGHT]: 'Spotlight Features',
};

export type GroupedScopes = {
    group: ScopeGroup;
    groupName: string;
    scopes: Scope[];
};

export const getScopesByGroup = (isEnterprise = false): GroupedScopes[] => {
    const allScopes = getScopes({ isEnterprise });

    const grouped = allScopes.reduce((acc, scope) => {
        if (!acc[scope.group]) {
            acc[scope.group] = [];
        }
        acc[scope.group].push(scope);
        return acc;
    }, {} as Record<ScopeGroup, Scope[]>);

    return Object.entries(grouped).map(([group, scopes]) => ({
        group: group as ScopeGroup,
        groupName: GROUP_DISPLAY_NAMES[group as ScopeGroup],
        scopes: scopes.sort((a, b) => a.name.localeCompare(b.name)),
    }));
};

/**
 * Convert scope name to human-readable format
 * e.g., "manage:Dashboard" -> "Manage Dashboard"
 */
export const formatScopeName = (scopeName: string): string => {
    return startCase(scopeName.replace(':', ' '));
};

/**
 * Filter scopes by search term (searches both scope name and group name)
 */
export const filterScopes = (
    groupedScopes: GroupedScopes[],
    searchTerm: string,
): GroupedScopes[] => {
    if (!searchTerm.trim()) {
        return groupedScopes;
    }

    const lowercaseSearch = searchTerm.toLowerCase();

    return groupedScopes
        .map((group) => {
            // Check if group name matches
            const groupMatches = group.groupName
                .toLowerCase()
                .includes(lowercaseSearch);

            // Filter scopes within the group
            const filteredScopes = group.scopes.filter((scope) => {
                const scopeNameMatches = formatScopeName(scope.name)
                    .toLowerCase()
                    .includes(lowercaseSearch);
                const descriptionMatches = scope.description
                    .toLowerCase()
                    .includes(lowercaseSearch);

                return scopeNameMatches || descriptionMatches;
            });

            // Include group if either the group name matches or it has matching scopes
            if (groupMatches || filteredScopes.length > 0) {
                return {
                    ...group,
                    scopes: groupMatches ? group.scopes : filteredScopes,
                };
            }

            return null;
        })
        .filter((group): group is GroupedScopes => group !== null);
};

export const isGroupFullySelected = (
    groupScopes: Scope[],
    selectedScopes: string[],
): boolean => {
    return groupScopes.every((scope) => selectedScopes.includes(scope.name));
};

export const isGroupPartiallySelected = (
    groupScopes: Scope[],
    selectedScopes: string[],
): boolean => {
    const selectedCount = groupScopes.filter((scope) =>
        selectedScopes.includes(scope.name),
    ).length;
    return selectedCount > 0 && selectedCount < groupScopes.length;
};

export const toggleGroupScopes = (
    groupScopes: Scope[],
    selectedScopes: string[],
    isSelected: boolean,
): string[] => {
    const groupScopeNames = groupScopes.map((scope) => scope.name as string);

    if (isSelected) {
        // Add all group scopes
        return Array.from(new Set([...selectedScopes, ...groupScopeNames]));
    } else {
        // Remove all group scopes
        return selectedScopes.filter(
            (scope) => !groupScopeNames.includes(scope),
        );
    }
};
