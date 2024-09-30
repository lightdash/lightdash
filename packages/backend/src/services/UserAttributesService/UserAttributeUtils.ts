import {
    AuthorizationError,
    CompiledDimension,
    Explore,
    getDimensions,
    UserAttributeValueMap,
} from '@lightdash/common';

export const hasUserAttribute = (
    userAttributes: UserAttributeValueMap,
    attributeName: string,
    value: string,
): boolean =>
    !!userAttributes[attributeName] &&
    userAttributes[attributeName].includes(value);

export const hasUserAttributes = (
    requiredAttributes: Record<string, string | string[]> | undefined,
    userAttributes: UserAttributeValueMap,
): boolean => {
    if (requiredAttributes === undefined) return true; // No required attributes

    // Check all required attributes conditions for dimension
    return Object.entries(requiredAttributes).every((attribute) => {
        const [attributeName, value] = attribute;

        if (typeof value === 'string')
            return hasUserAttribute(userAttributes, attributeName, value);

        return value.some((v) =>
            hasUserAttribute(userAttributes, attributeName, v),
        );
    });
};

export const exploreHasFilteredAttribute = (explore: Explore) =>
    Object.values(explore.tables).some(
        (table) =>
            table.requiredAttributes !== undefined ||
            Object.values(table.dimensions).some(
                (dimension) => dimension.requiredAttributes !== undefined,
            ),
    );

export const doesExploreMatchRequiredAttributes = (
    explore: Explore,
    userAttributes: UserAttributeValueMap,
) =>
    explore.tables[explore.baseTable].requiredAttributes === undefined ||
    hasUserAttributes(
        explore.tables[explore.baseTable].requiredAttributes,
        userAttributes,
    );

export const getFilteredExplore = (
    explore: Explore,
    userAttributes: UserAttributeValueMap,
): Explore => {
    if (!doesExploreMatchRequiredAttributes(explore, userAttributes)) {
        throw new AuthorizationError(
            "You don't have authorization to access this explore",
        );
    }

    const filteredTableNames: string[] = Object.values(explore.tables).reduce<
        string[]
    >((acc, table) => {
        if (hasUserAttributes(table.requiredAttributes, userAttributes))
            return [...acc, table.name];
        return acc;
    }, []);

    return {
        ...explore,
        joinedTables: explore.joinedTables.filter((joinedTable) =>
            filteredTableNames.includes(joinedTable.table),
        ),
        tables: Object.entries(explore.tables).reduce((at, exploreTable) => {
            const [tableName, table] = exploreTable;
            if (!filteredTableNames.includes(tableName)) return at;
            return {
                ...at,
                [tableName]: {
                    ...table,
                    metrics: Object.fromEntries(
                        Object.entries(table.metrics).filter(
                            ([metricName, metric]) => {
                                const canAccessMetric = hasUserAttributes(
                                    metric.requiredAttributes,
                                    userAttributes,
                                );
                                if (!canAccessMetric) return false;
                                return (
                                    !metric.tablesReferences ||
                                    metric.tablesReferences.every(
                                        (tableReference) =>
                                            filteredTableNames.includes(
                                                tableReference,
                                            ),
                                    )
                                );
                            },
                        ),
                    ),
                    dimensions: Object.fromEntries(
                        Object.entries(table.dimensions).filter(
                            ([dimensionName, dimension]) => {
                                const canAccessAllTableReferences =
                                    !dimension.tablesReferences ||
                                    dimension.tablesReferences.every(
                                        (tableReference) =>
                                            filteredTableNames.includes(
                                                tableReference,
                                            ),
                                    );
                                const canAccessDimension = hasUserAttributes(
                                    dimension.requiredAttributes,
                                    userAttributes,
                                );
                                return (
                                    canAccessAllTableReferences &&
                                    canAccessDimension
                                );
                            },
                        ),
                    ),
                },
            };
        }, {}),
    };
};
