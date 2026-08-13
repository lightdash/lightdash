import { countTotalFilterRules, type Filters } from '@lightdash/common';
import { Badge } from '@mantine/core';
import { memo, useCallback, useMemo, type FC } from 'react';
import CollapsableCard from '../../../components/common/CollapsableCard/CollapsableCard';
import FiltersForm from '../../../components/common/Filters';
import FiltersProvider from '../../../components/common/Filters/FiltersProvider';
import { useFieldsWithSuggestions } from '../../../components/Explorer/FiltersCard/useFieldsWithSuggestions';
import { useExplore } from '../../../hooks/useExplore';
import { useProject } from '../../../hooks/useProject';
import { useProjectUuid } from '../../../hooks/useProjectUuid';
import { ExplorerSection } from '../../../providers/Explorer/types';
import {
    explorerActions,
    selectIsEditMode,
    selectIsFiltersExpanded,
    selectParameters,
    useExplorerDispatch,
    useExplorerSelector,
} from '../../explorer/store';
import { useMerge } from '../context/useMerge';
import { MergeFilterSwitch } from './MergeFilterSwitch';

/**
 * The Filters card, editing Query B. The card follows the merge focus the
 * same way the sidebar does: one interaction model, with ownership shown by
 * the query's colour rather than a second panel or a tab the other side's
 * filters would hide behind.
 */
const MergeQueryBFiltersCard: FC = memo(() => {
    const projectUuid = useProjectUuid();
    const project = useProject(projectUuid);
    const { queryB, filtersB, setFiltersB } = useMerge();

    const filterIsOpen = useExplorerSelector(selectIsFiltersExpanded);
    const isEditMode = useExplorerSelector(selectIsEditMode);
    const parameterValues = useExplorerSelector(selectParameters);
    const dispatch = useExplorerDispatch();

    const { data: exploreB } = useExplore(queryB.exploreName ?? undefined);

    const fieldsWithSuggestions = useFieldsWithSuggestions({
        exploreData: exploreB,
        rows: undefined,
        customDimensions: undefined,
        additionalMetrics: undefined,
        tableCalculations: undefined,
        includeHiddenFields: false,
    });

    const setFilters = useCallback(
        (newFilters: Filters) => setFiltersB(newFilters),
        [setFiltersB],
    );
    const toggleExpandedSection = useCallback(
        (section: ExplorerSection) => {
            dispatch(explorerActions.toggleExpandedSection(section));
        },
        [dispatch],
    );

    const totalActiveFilters = useMemo(
        () => countTotalFilterRules(filtersB),
        [filtersB],
    );

    return (
        <CollapsableCard
            isOpen={filterIsOpen}
            title="Filters"
            disabled={!queryB.exploreName}
            onToggle={() => toggleExpandedSection(ExplorerSection.FILTERS)}
            headerElement={
                <>
                    <MergeFilterSwitch />
                    {totalActiveFilters > 0 && !filterIsOpen ? (
                        <Badge color="gray" variant="light" tt="none" fw={500}>
                            {totalActiveFilters} active filter
                            {totalActiveFilters === 1 ? '' : 's'}
                        </Badge>
                    ) : null}
                </>
            }
        >
            <FiltersProvider
                projectUuid={projectUuid}
                itemsMap={fieldsWithSuggestions}
                startOfWeek={
                    project.data?.warehouseConnection?.startOfWeek ?? undefined
                }
                popoverProps={{ withinPortal: true }}
                baseTable={exploreB?.baseTable}
                parameterValues={parameterValues}
            >
                <FiltersForm
                    isEditMode={isEditMode}
                    filters={filtersB}
                    setFilters={setFilters}
                />
            </FiltersProvider>
        </CollapsableCard>
    );
});

export default MergeQueryBFiltersCard;
