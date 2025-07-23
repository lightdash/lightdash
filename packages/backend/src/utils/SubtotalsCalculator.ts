import {
    getSubtotalKey,
    MetricQuery,
    type TableCalculation,
} from '@lightdash/common';
import { ValidationService } from '../services/ValidationService/ValidationService';

export interface SubtotalDimensionGroups {
    dimensionGroupsToSubtotal: string[][];
    analyticsData: {
        subtotalDimensionGroups: string[];
        subtotalQueryCount: number;
    };
}

export interface SubtotalQueryConfig {
    metricQuery: MetricQuery;
    dimensions: string[];
    tableCalculations: TableCalculation[];
}

/**
 * Utility class for shared subtotals calculation logic.
 * Eliminates duplication between ProjectService and EmbedService.
 */
export class SubtotalsCalculator {
    /**
     * Orders dimensions according to columnOrder and creates subtotal groupings.
     * This is the core business logic for determining which dimension combinations
     * should have subtotals calculated.
     */
    static prepareDimensionGroups(
        metricQuery: MetricQuery,
        columnOrder: string[],
        pivotDimensions?: string[],
    ): SubtotalDimensionGroups {
        // Order dimensions according to columnOrder
        const orderedDimensions = metricQuery.dimensions.sort((a, b) => {
            const aIndex = columnOrder.indexOf(a);
            const bIndex = columnOrder.indexOf(b);
            // Handle cases where dimension isn't in columnOrder
            if (aIndex === -1) return 1;
            if (bIndex === -1) return -1;
            return aIndex - bIndex;
        });

        // Pivot dimensions always need to be in the query, therefore we need to remove them
        // before calculating the subtotal groupings by order
        const orderedDimensionsWithoutPivot = orderedDimensions.filter(
            (dimension) => !pivotDimensions?.includes(dimension),
        );

        // Remove the last dimension since it will not be used for subtotals,
        // would produce the most detailed row
        const dimensionsToSubtotal = orderedDimensionsWithoutPivot.slice(0, -1);

        // Create a list of all the dimension groups to subtotal, starting with the first dimension,
        // then the first two dimensions, then the first three dimensions, etc.
        const dimensionGroupsToSubtotal = dimensionsToSubtotal.map(
            (dimension, index) => {
                if (index === 0) {
                    return [dimension];
                }

                return [...dimensionsToSubtotal.slice(0, index), dimension];
            },
        );

        return {
            dimensionGroupsToSubtotal,
            analyticsData: {
                subtotalDimensionGroups: dimensionGroupsToSubtotal.map(
                    (group) => group.join(','),
                ),
                subtotalQueryCount: dimensionGroupsToSubtotal.length,
            },
        };
    }

    /**
     * Filters table calculations to include only those that reference dimensions/metrics
     * that are available in the subtotal query.
     */
    static filterTableCalculations(
        metricQuery: MetricQuery,
        dimensions: string[],
    ): TableCalculation[] {
        return metricQuery.tableCalculations.filter((tc) => {
            const referencedFields =
                ValidationService.getTableCalculationFieldIds([tc]);
            return referencedFields.every(
                (field: string) =>
                    dimensions.includes(field) ||
                    metricQuery.metrics.includes(field),
            );
        });
    }

    /**
     * Creates a MetricQuery configuration for a specific subtotal group.
     * Removes sorts and filters table calculations appropriately.
     */
    static createSubtotalQueryConfig(
        baseMetricQuery: MetricQuery,
        subtotalDimensions: string[],
        pivotDimensions?: string[],
    ): SubtotalQueryConfig {
        const dimensions = [
            ...subtotalDimensions,
            ...(pivotDimensions || []), // Always include pivot dimensions in subtotal query
        ];

        const tableCalculations = this.filterTableCalculations(
            baseMetricQuery,
            dimensions,
        );

        const metricQuery: MetricQuery = {
            ...baseMetricQuery,
            dimensions,
            tableCalculations,
            sorts: [], // Remove sorts from subtotal queries
        };

        return {
            metricQuery,
            dimensions,
            tableCalculations,
        };
    }

    /**
     * Generates subtotal entries in the format expected by the API response.
     * This helper ensures consistent key generation and result formatting.
     */
    static formatSubtotalEntries(
        subtotalResults: Array<[string, Record<string, unknown>[]]>,
    ): { [subtotalDimensions: string]: { [key: string]: number }[] } {
        return Object.fromEntries(subtotalResults) as {
            [subtotalDimensions: string]: { [key: string]: number }[];
        };
    }

    /**
     * Creates a subtotal key for a given set of dimensions.
     * Delegates to the common utility to ensure consistency.
     */
    static getSubtotalKey(dimensions: string[]): string {
        return getSubtotalKey(dimensions);
    }
}
