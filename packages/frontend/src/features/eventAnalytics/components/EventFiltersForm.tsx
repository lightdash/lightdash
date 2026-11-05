import { isDimension, type Filters } from '@lightdash/common';
import { useMemo, type FC } from 'react';
import FiltersForm from '../../../components/common/Filters';
import FiltersProvider from '../../../components/common/Filters/FiltersProvider';
import { useFieldsWithSuggestions } from '../../../components/Explorer/FiltersCard/useFieldsWithSuggestions';
import { useExplore } from '../../../hooks/useExplore';
import { useExploreWarehouseConnection } from '../../../hooks/useExploreWarehouseConnection';

type Props = {
    projectUuid: string;
    exploreName: string;
    filters: Filters;
    onChange: (filters: Filters) => void;
};

/**
 * Dimension filters over the explore base table, using the same `Filters`
 * payload as the semantic layer so dashboard filters can be pushed down.
 */
export const EventFiltersForm: FC<Props> = ({
    projectUuid,
    exploreName,
    filters,
    onChange,
}) => {
    const { data: explore } = useExplore(exploreName);
    const { startOfWeek, warehouseType } = useExploreWarehouseConnection(
        exploreName,
        projectUuid,
    );

    const allFields = useFieldsWithSuggestions({
        exploreData: explore,
        rows: undefined,
        customDimensions: undefined,
        additionalMetrics: undefined,
        tableCalculations: undefined,
        includeHiddenFields: false,
    });

    // Event analytics queries only scan the base table
    const baseTableFields = useMemo(
        () =>
            Object.fromEntries(
                Object.entries(allFields).filter(
                    ([, field]) =>
                        isDimension(field) &&
                        field.table === explore?.baseTable,
                ),
            ),
        [allFields, explore?.baseTable],
    );

    if (!explore) return null;

    return (
        <FiltersProvider
            projectUuid={projectUuid}
            itemsMap={baseTableFields}
            startOfWeek={startOfWeek ?? undefined}
            warehouseType={warehouseType}
            baseTable={explore.baseTable}
            popoverProps={{ withinPortal: true }}
        >
            <FiltersForm
                isEditMode
                compact
                filters={filters}
                setFilters={onChange}
            />
        </FiltersProvider>
    );
};
