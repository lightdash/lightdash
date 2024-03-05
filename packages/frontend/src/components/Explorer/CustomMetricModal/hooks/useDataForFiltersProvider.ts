import { useParams } from 'react-router-dom';
import { useProject } from '../../../../hooks/useProject';
import { useExplorerContext } from '../../../../providers/ExplorerProvider';
import { useFieldsWithSuggestions } from '../../FiltersCard/useFieldsWithSuggestions';

export const useDataForFiltersProvider = () => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const project = useProject(projectUuid);

    const queryResults = useExplorerContext(
        (context) => context.queryResults.data,
    );

    const explore = useExplorerContext((context) => context.state.explore);
    const additionalMetrics = useExplorerContext(
        (context) =>
            context.state.unsavedChartVersion.metricQuery.additionalMetrics,
    );

    const tableCalculations = useExplorerContext(
        (context) =>
            context.state.unsavedChartVersion.metricQuery.tableCalculations,
    );

    const fieldsWithSuggestions = useFieldsWithSuggestions({
        exploreData: explore,
        queryResults,
        additionalMetrics,
        tableCalculations,
    });

    return {
        projectUuid,
        fieldsMap: fieldsWithSuggestions,
        startOfWeek: project.data?.warehouseConnection?.startOfWeek,
    };
};
