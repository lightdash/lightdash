import { Explore, UserAttributeValueMap } from '@lightdash/common';

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
    Object.values(explore.tables).some((table) =>
        Object.values(table.dimensions).some(
            (dimension) => dimension.requiredAttributes !== undefined,
        ),
    );
export const filterDimensionsFromExplore = (
    explore: Explore,
    userAttributes: UserAttributeValueMap,
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
