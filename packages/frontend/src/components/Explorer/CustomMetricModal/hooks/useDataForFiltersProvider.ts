import type {
    AdditionalMetric,
    CustomDimension,
    TableCalculation,
} from '@lightdash/common';
import {
    selectAdditionalMetrics,
    selectCustomDimensions,
    selectTableCalculations,
    selectTableName,
    useExplorerSelector,
} from '../../../../features/explorer/store';
import { useExplore } from '../../../../hooks/useExplore';
import { useExplorerQuery } from '../../../../hooks/useExplorerQuery';
import { useProject } from '../../../../hooks/useProject';
import { useProjectUuid } from '../../../../hooks/useProjectUuid';
import { useFieldsWithSuggestions } from '../../FiltersCard/useFieldsWithSuggestions';

type CustomMetricQueryContext = {
    tableName: string | undefined;
    additionalMetrics: AdditionalMetric[] | undefined;
    customDimensions: CustomDimension[] | undefined;
    tableCalculations: TableCalculation[] | undefined;
};

export const useDataForFiltersProvider = (
    queryContext?: CustomMetricQueryContext,
) => {
    const projectUuid = useProjectUuid();
    const project = useProject(projectUuid);

    const explorerTableName = useExplorerSelector(selectTableName);
    const explorerAdditionalMetrics = useExplorerSelector(
        selectAdditionalMetrics,
    );
    const explorerCustomDimensions = useExplorerSelector(
        selectCustomDimensions,
    );
    const explorerTableCalculations = useExplorerSelector(
        selectTableCalculations,
    );

    const tableName = queryContext ? queryContext.tableName : explorerTableName;
    const additionalMetrics = queryContext
        ? queryContext.additionalMetrics
        : explorerAdditionalMetrics;
    const customDimensions = queryContext
        ? queryContext.customDimensions
        : explorerCustomDimensions;
    const tableCalculations = queryContext
        ? queryContext.tableCalculations
        : explorerTableCalculations;

    const { queryResults } = useExplorerQuery();
    const rows = queryResults.rows;

    const { data: exploreData } = useExplore(tableName);

    const fieldsWithSuggestions = useFieldsWithSuggestions({
        exploreData,
        rows: queryContext ? [] : rows,
        customDimensions,
        additionalMetrics,
        tableCalculations,
        includeHiddenFields: true,
    });

    return {
        projectUuid,
        fieldsMap: fieldsWithSuggestions,
        startOfWeek: project.data?.warehouseConnection?.startOfWeek,
    };
};
