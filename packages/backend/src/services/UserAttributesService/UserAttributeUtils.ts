import { subject } from '@casl/ability';
import {
    AuthorizationError,
    CorruptedExploreError,
    Explore,
    ForbiddenError,
    SessionUser,
    UserAttributeValueMap,
} from '@lightdash/common';
import { z } from 'zod';

/**
 * Zod schema for parsing user attribute overrides from headers.
 * Accepts an object with string or string[] values and normalizes all values to arrays.
 */
export const userAttributeOverridesSchema = z
    .record(z.union([z.string(), z.array(z.string())]))
    .transform((obj) => {
        const normalized: UserAttributeValueMap = {};
        for (const [key, value] of Object.entries(obj)) {
            normalized[key] = typeof value === 'string' ? [value] : value;
        }
        return normalized;
    });

/**
 * Validates that header user attributes are allowed:
 * 1. User must be org admin/owner to use header overrides
 * 2. Override values must be a subset of user's existing permissions (narrowing only)
 */
export const validateUserAttributeOverrides = (
    user: SessionUser,
    headerAttributes: UserAttributeValueMap,
    dbAttributes: UserAttributeValueMap,
): void => {
    const { organizationUuid } = user;

    // Check admin permission - only admins can override via header
    if (
        user.ability.cannot(
            'manage',
            subject('Organization', { organizationUuid }),
        )
    ) {
        throw new ForbiddenError(
            'Only organization admins can use attribute overrides',
        );
    }

    // Validate narrowing: header values must be subset of existing permissions
    // Exception: if user has no existing value for an attribute, admin can set it
    for (const [key, overrideValues] of Object.entries(headerAttributes)) {
        const existingValues = dbAttributes[key];

        // If user has no existing values for this attribute, allow admin to set it
        if (!existingValues || existingValues.length === 0) {
            // eslint-disable-next-line no-continue
            continue;
        }

        const hasWildcard = existingValues.includes('*');

        if (!hasWildcard) {
            const isSubset = overrideValues.every((v) =>
                existingValues.includes(v),
            );
            if (!isSubset) {
                throw new ForbiddenError(
                    `Cannot expand access via header: values for '${key}' must be a subset of your existing permissions [${existingValues.join(
                        ', ',
                    )}]`,
                );
            }
        }
    }
};

/**
 * Merges database user attributes with optional header overrides.
 * Header attributes take priority over database attributes.
 */
export const mergeUserAttributes = (
    dbAttributes: UserAttributeValueMap,
    attributeOverrides?: UserAttributeValueMap,
): UserAttributeValueMap => ({
    ...dbAttributes,
    ...(attributeOverrides || {}),
});

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
    Object.values(explore.tables).some((table) => {
        if (!table) return false;

        return (
            table.requiredAttributes !== undefined ||
            Object.values(table.dimensions).some(
                (dimension) => dimension?.requiredAttributes !== undefined,
            )
        );
    });

export const doesExploreMatchRequiredAttributes = (
    exploreAttributes:
        | Explore['tables'][string]['requiredAttributes']
        | undefined,
    userAttributes: UserAttributeValueMap,
) =>
    exploreAttributes === undefined ||
    hasUserAttributes(exploreAttributes, userAttributes);

export const getFilteredExplore = (
    explore: Explore,
    userAttributes: UserAttributeValueMap,
): Explore => {
    const baseTable = explore.tables[explore.baseTable];
    if (!baseTable) {
        throw new CorruptedExploreError(
            `Explore '${explore.name}' has missing or null base table '${explore.baseTable}'`,
            { exploreName: explore.name, baseTable: explore.baseTable },
        );
    }
    if (
        !doesExploreMatchRequiredAttributes(
            baseTable.requiredAttributes,
            userAttributes,
        )
    ) {
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
        ...(filteredTableNames.length > 0
            ? { unfilteredTables: explore.tables }
            : {}),
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
                                if (!metric) return false;

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
                                if (!dimension) return false;

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
