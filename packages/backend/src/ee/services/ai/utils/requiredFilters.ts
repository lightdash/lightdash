import {
    convertFieldRefToFieldId,
    isJoinModelRequiredFilter,
    type ModelRequiredFilterRule,
} from '@lightdash/common';
import type { AiAgentRequiredFilterMetadata } from '../types/aiAgentDependencies';

export const getRequiredFilterMetadata = (
    filter: ModelRequiredFilterRule,
    fallbackTableName: string,
): AiAgentRequiredFilterMetadata => {
    const tableName = isJoinModelRequiredFilter(filter)
        ? filter.target.tableName
        : fallbackTableName;

    return {
        fieldId: convertFieldRefToFieldId(filter.target.fieldRef, tableName),
        fieldRef: filter.target.fieldRef,
        tableName,
        operator: filter.operator,
        values: filter.values,
        settings: filter.settings,
        required: filter.required ?? true,
    };
};

type ExploreRequiredFiltersSource = {
    baseTable: string;
    tables: Record<
        string,
        | {
              requiredFilters?: ModelRequiredFilterRule[];
          }
        | undefined
    >;
};

export const getExploreRequiredFilters = (
    explore: ExploreRequiredFiltersSource | undefined,
): AiAgentRequiredFilterMetadata[] => {
    if (!explore) return [];

    return (explore.tables[explore.baseTable]?.requiredFilters ?? []).map(
        (filter) => getRequiredFilterMetadata(filter, explore.baseTable),
    );
};
