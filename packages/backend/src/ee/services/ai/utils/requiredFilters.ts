import {
    convertFieldRefToFieldId,
    isJoinModelRequiredFilter,
    type CompiledTable,
    type Explore,
    type ModelRequiredFilterRule,
} from '@lightdash/common';
import type { AiAgentRequiredFilterMetadata } from '../types/aiAgentDependencies';

const getRequiredFilterMetadata = (
    filter: ModelRequiredFilterRule,
    baseTableName: string,
): AiAgentRequiredFilterMetadata => {
    const tableName = isJoinModelRequiredFilter(filter)
        ? filter.target.tableName
        : baseTableName;

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

type ExploreRequiredFiltersSource = Pick<Explore, 'baseTable'> & {
    tables: Record<string, Pick<CompiledTable, 'requiredFilters'> | undefined>;
};

export const getExploreRequiredFilters = (
    explore: ExploreRequiredFiltersSource | undefined,
): AiAgentRequiredFilterMetadata[] => {
    if (!explore) return [];

    return (explore.tables[explore.baseTable]?.requiredFilters ?? []).map(
        (filter) => getRequiredFilterMetadata(filter, explore.baseTable),
    );
};
