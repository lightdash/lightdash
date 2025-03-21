import { useParams } from 'react-router';
import { useExplore } from '../../../../hooks/useExplore';
import { useProject } from '../../../../hooks/useProject';
import useExplorerContext from '../../../../providers/Explorer/useExplorerContext';
import { useFieldsWithSuggestions } from '../../FiltersCard/useFieldsWithSuggestions';

export const useDataForFiltersProvider = () => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const project = useProject(projectUuid);

    const tableName = useExplorerContext(
        (context) => context.state.unsavedChartVersion.tableName,
    );

    const rows = useExplorerContext((context) => context.queryResults.rows);

    const { data: exploreData } = useExplore(tableName);

    const additionalMetrics = useExplorerContext(
        (context) =>
            context.state.unsavedChartVersion.metricQuery.additionalMetrics,
    );

    const customDimensions = useExplorerContext(
        (context) =>
            context.state.unsavedChartVersion.metricQuery.customDimensions,
    );

    const tableCalculations = useExplorerContext(
        (context) =>
            context.state.unsavedChartVersion.metricQuery.tableCalculations,
    );

    const fieldsWithSuggestions = useFieldsWithSuggestions({
        exploreData,
        rows,
        customDimensions,
        additionalMetrics,
        tableCalculations,
    });

    return {
        projectUuid,
        fieldsMap: fieldsWithSuggestions,
        startOfWeek: project.data?.warehouseConnection?.startOfWeek,
    };
};
