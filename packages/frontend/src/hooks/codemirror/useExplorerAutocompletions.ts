import {
    type CompletionContext,
    type CompletionSource,
} from '@codemirror/autocomplete';
import {
    convertAdditionalMetric,
    getDimensions,
    getFieldRef,
    getItemId,
    type AdditionalMetric,
    type CustomDimension,
    type Explore,
    type Field,
    type TableCalculation,
} from '@lightdash/common';
import { useMemo } from 'react';

interface ExplorerAutocompletionsConfig {
    explore?: Explore;
    activeFields?: Set<string>;
    additionalMetrics?: AdditionalMetric[];
    customDimensions?: CustomDimension[];
    tableCalculations?: TableCalculation[];
}

const createFieldCompletions = (
    fields: Field[],
    meta: string,
): Array<{
    label: string;
    detail: string;
    type: string;
    insertText: string;
}> => {
    return fields.flatMap((field) => {
        const technicalRef = `\${${getFieldRef(field)}}`;
        const friendlyLabel = `${field.tableLabel} ${field.label}`;

        return [
            {
                label: technicalRef,
                detail: meta,
                type: 'variable',
                insertText: technicalRef,
            },
            {
                label: friendlyLabel,
                detail: meta,
                type: 'variable',
                insertText: technicalRef,
            },
        ];
    });
};

const createTableCalculationCompletions = (
    tableCalculations: { name: string; displayName: string }[],
): Array<{
    label: string;
    detail: string;
    type: string;
    insertText: string;
}> => {
    return tableCalculations.flatMap((tc) => {
        const technicalRef = `\${${tc.name}}`;

        return [
            {
                label: technicalRef,
                detail: 'Table calculation',
                type: 'variable',
                insertText: technicalRef,
            },
            {
                label: tc.displayName,
                detail: 'Table calculation',
                type: 'variable',
                insertText: technicalRef,
            },
        ];
    });
};

const createCustomDimensionCompletions = (
    customDimensions: { id: string; name: string }[],
): Array<{
    label: string;
    detail: string;
    type: string;
    insertText: string;
}> => {
    return customDimensions.flatMap((cd) => {
        const technicalRef = `\${${cd.id}}`;

        return [
            {
                label: technicalRef,
                detail: 'Custom dimension',
                type: 'variable',
                insertText: technicalRef,
            },
            {
                label: cd.name,
                detail: 'Custom dimension',
                type: 'variable',
                insertText: technicalRef,
            },
        ];
    });
};

/**
 * Hook for table calculation autocomplete - shows metrics, dimensions, table calculations, and custom dimensions
 */
export const useTableCalculationAutocompletions = ({
    explore,
    activeFields,
    additionalMetrics = [],
    customDimensions = [],
    tableCalculations = [],
}: ExplorerAutocompletionsConfig): CompletionSource | undefined => {
    return useMemo(() => {
        if (!explore) return undefined;

        const allCompletions = Object.values(explore.tables).reduce<
            Array<{
                label: string;
                detail: string;
                type: string;
                insertText: string;
            }>
        >((acc, table) => {
            // Get custom metrics for this table
            const customMetrics = additionalMetrics
                .filter((metric) => metric.table === table.name)
                .map((additionalMetric) =>
                    convertAdditionalMetric({
                        additionalMetric,
                        table,
                    }),
                );

            // Filter to active fields if activeFields is provided
            const activeMetrics = [
                ...Object.values(table.metrics),
                ...customMetrics,
            ].filter(
                (field) => !activeFields || activeFields.has(getItemId(field)),
            );

            const activeDimensions = Object.values(table.dimensions).filter(
                (field) => !activeFields || activeFields.has(getItemId(field)),
            );

            return [
                ...acc,
                ...createFieldCompletions(activeMetrics, 'Metric'),
                ...createFieldCompletions(activeDimensions, 'Dimension'),
            ];
        }, []);

        // Add custom dimensions (filtered to active ones if needed)
        const activeCustomDimensions = customDimensions.filter(
            (cd) => !activeFields || activeFields.has(cd.id),
        );
        allCompletions.push(
            ...createCustomDimensionCompletions(activeCustomDimensions),
        );

        // Add table calculations (no need to filter, they don't exist when not active)
        allCompletions.push(
            ...createTableCalculationCompletions(tableCalculations),
        );

        return (context: CompletionContext) => {
            const word = context.matchBefore(/\$\{[\w.]*$/);
            if (!word) return null;

            return {
                from: word.from,
                options: allCompletions.map((item) => ({
                    label: item.label,
                    detail: item.detail,
                    type: item.type,
                    apply: item.insertText,
                })),
            };
        };
    }, [
        explore,
        activeFields,
        additionalMetrics,
        customDimensions,
        tableCalculations,
    ]);
};

/**
 * Hook for custom dimension autocomplete - shows only dimensions
 */
export const useCustomDimensionsAutocompletions = (
    explore?: Explore,
): CompletionSource | undefined => {
    return useMemo(() => {
        if (!explore) return undefined;

        const dimensions = getDimensions(explore);
        const completions = createFieldCompletions(dimensions, 'Dimension');

        return (context: CompletionContext) => {
            const word = context.matchBefore(/\$\{[\w.]*$/);
            if (!word) return null;

            return {
                from: word.from,
                options: completions.map((item) => ({
                    label: item.label,
                    detail: item.detail,
                    type: item.type,
                    apply: item.insertText,
                })),
            };
        };
    }, [explore]);
};
