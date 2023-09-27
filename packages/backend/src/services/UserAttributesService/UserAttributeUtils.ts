import { Explore } from '@lightdash/common';

export const hasUserAttribute = (
    userAttributes: Record<string, string | null>,
    attributeName: string,
    value: string,
) => userAttributes[attributeName] === value;

export const hasUserAttributes = (
    requiredAttributes: Record<string, string> | undefined,
    userAttributes: Record<string, string | null>,
): boolean => {
    if (requiredAttributes === undefined) return true; // No required attributes

    // Check all required attributes conditions for dimension
    return Object.entries(requiredAttributes).every((attribute) => {
        const [attributeName, value] = attribute;
        return hasUserAttribute(userAttributes, attributeName, value);
    });
};

export const exploreHasFilteredAttribute = (explore: Explore) =>
    Object.values(explore.tables).some((table) =>
        Object.values(table.dimensions).some(
            (dimension) => dimension.requiredAttributes !== undefined,
        ),
    );
export const filterDimensionsFromExplore = (
    explore: Explore,
    userAttributes: Record<string, string | null>,
): Explore => ({
    ...explore,
    tables: Object.entries(explore.tables).reduce((at, exploreTable) => {
        const [tableName, table] = exploreTable;
        return {
            ...at,
            [tableName]: {
                ...table,
                dimensions: Object.entries(table.dimensions).reduce(
                    (acc, tableDimension) => {
                        const [dimensionName, dimension] = tableDimension;

                        if (
                            hasUserAttributes(
                                dimension.requiredAttributes,
                                userAttributes,
                            )
                        )
                            return { ...acc, [dimensionName]: dimension };
                        return acc;
                    },
                    [],
                ),
            },
        };
    }, {}),
});
