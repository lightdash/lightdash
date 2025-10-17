import type { Change, CompiledMetric } from '@lightdash/common';
import { FieldType } from '@lightdash/common';
import type { CreateMetric } from './types';

/**
 * Extended metric type that includes UI-specific fields from the AI proposal
 */
export type MergedMetric = CompiledMetric & {
    baseDimensionName: string;
};

/**
 * Merges the AI's proposed metric change with the backend's compiled metric data.
 */
export function mergeCreateMetricData(
    aiProposal: CreateMetric,
    changePayload: Change['payload'] | undefined,
): MergedMetric | null {
    // Type guard to check if changePayload exists and is a metric type
    if (
        !changePayload ||
        !('type' in changePayload) ||
        changePayload.type !== 'metric'
    ) {
        return null;
    }

    const { metric: proposedMetric } = aiProposal.value;
    const compiledData = changePayload.value;

    return {
        // Base fields from AI proposal
        name: proposedMetric.name,
        type: proposedMetric.type,
        label: proposedMetric.label,
        table: proposedMetric.table,
        description: proposedMetric.description,
        baseDimensionName: proposedMetric.baseDimensionName,

        // Compiled fields from backend
        fieldType: FieldType.METRIC,
        tableLabel: compiledData.tableLabel,
        sql: compiledData.sql,
        compiledSql: compiledData.compiledSql,
        hidden: compiledData.hidden,

        // Optional fields from backend (if they exist)
        tablesReferences: compiledData.tablesReferences,
        tablesRequiredAttributes: compiledData.tablesRequiredAttributes,
    };
}
