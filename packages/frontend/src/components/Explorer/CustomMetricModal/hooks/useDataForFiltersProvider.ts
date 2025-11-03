import { useParams } from 'react-router';
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
import { useFieldsWithSuggestions } from '../../FiltersCard/useFieldsWithSuggestions';

export const useDataForFiltersProvider = () => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const project = useProject(projectUuid);

    const tableName = useExplorerSelector(selectTableName);
    const additionalMetrics = useExplorerSelector(selectAdditionalMetrics);
    const customDimensions = useExplorerSelector(selectCustomDimensions);
    const tableCalculations = useExplorerSelector(selectTableCalculations);

    const { queryResults } = useExplorerQuery();
    const rows = queryResults.rows;

    const { data: exploreData } = useExplore(tableName);

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
