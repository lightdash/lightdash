import {
    getScopes,
    isScopeAssignableAtLevel,
    ScopeGroup,
    type RoleLevel,
    type Scope,
} from '@lightdash/common';
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

export type ScopeDependency = {
    description?: string;
    name: Scope['name'];
};

export type DependencyStatus = 'full' | 'partial' | 'empty';

export type DependencyStatusCounts = Record<DependencyStatus, number>;

export const getScopesByGroup = (
    isEnterprise = false,
    level?: RoleLevel,
): GroupedScopes[] => {
    const allScopes = getScopes({ isEnterprise });
    const assignableScopes = level
        ? allScopes.filter((scope) =>
              isScopeAssignableAtLevel(scope.name, level),
          )
        : allScopes;

    const grouped = assignableScopes.reduce(
        (acc, scope) => {
            if (!acc[scope.group]) {
                acc[scope.group] = [];
            }
            acc[scope.group].push(scope);
            return acc;
        },
        {} as Record<ScopeGroup, Scope[]>,
    );

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

export const getScopeDependencies = (scopeName: string): ScopeDependency[] => {
    const scopeMap = Object.fromEntries(
        getScopes({ isEnterprise: true }).map((scope) => [scope.name, scope]),
    ) as Record<string, Scope>;
    const rootScope = scopeMap[scopeName];

    if (!rootScope) {
        return [];
    }

    const visited = new Set<string>([scopeName]);
    const dependencies: ScopeDependency[] = [];
    const queue = [rootScope];
    let queueIndex = 0;

    while (queueIndex < queue.length) {
        const currentScope = queue[queueIndex];
        queueIndex += 1;

        currentScope.dependencies.forEach((dependency) => {
            const dependencyScope = scopeMap[dependency.name];

            if (!dependencyScope || visited.has(dependency.name)) {
                return;
            }

            visited.add(dependency.name);
            dependencies.push({
                name: dependency.name,
                description:
                    dependency.description ?? dependencyScope.description,
            });
            queue.push(dependencyScope);
        });
    }

    return dependencies;
};

export const getScopeNamesWithDependencies = (scopeName: string): string[] => [
    scopeName,
    ...getScopeDependencies(scopeName).map((dependency) => dependency.name),
];

export const getScopeDependencyStatus = (
    scopeName: string,
    scopes: Record<string, boolean>,
): DependencyStatus => {
    const dependencies = getScopeDependencies(scopeName);
    const selectedDependencyCount = dependencies.filter(
        (dependency) => scopes[dependency.name],
    ).length;

    if (
        dependencies.length === 0 ||
        selectedDependencyCount === dependencies.length
    ) {
        return 'full';
    }

    return selectedDependencyCount === 0 ? 'empty' : 'partial';
};

export const getScopeDependencyStatusCounts = ({
    isEnterprise = true,
    level,
    scopes,
}: {
    isEnterprise?: boolean;
    level?: RoleLevel;
    scopes: Record<string, boolean>;
}): DependencyStatusCounts => {
    const selectedScopeNames = new Set(
        Object.entries(scopes)
            .filter(([_, isSelected]) => isSelected)
            .map(([scopeName]) => scopeName),
    );

    return getScopesByGroup(isEnterprise, level)
        .flatMap((group) => group.scopes)
        .filter((scope) => selectedScopeNames.has(scope.name))
        .reduce<DependencyStatusCounts>(
            (acc, scope) => {
                const status = getScopeDependencyStatus(scope.name, scopes);

                return { ...acc, [status]: acc[status] + 1 };
            },
            { full: 0, partial: 0, empty: 0 },
        );
};

export const filterScopesByDependencyStatus = (
    groupedScopes: GroupedScopes[],
    scopes: Record<string, boolean>,
    status?: DependencyStatus,
): GroupedScopes[] => {
    if (!status) {
        return groupedScopes;
    }

    return groupedScopes
        .map((group) => ({
            ...group,
            scopes: group.scopes.filter(
                (scope) =>
                    scopes[scope.name] &&
                    getScopeDependencyStatus(scope.name, scopes) === status,
            ),
        }))
        .filter((group) => group.scopes.length > 0);
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
