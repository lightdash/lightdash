import {
    DashboardFieldTarget,
    DashboardFilterRule,
    FilterableField,
    FilterOperator,
    isField,
    isFilterableField,
} from '@lightdash/common';
import { Box, PopoverProps } from '@mantine/core';
import { FC, useState } from 'react';
import { useDashboardContext } from '../../../providers/DashboardProvider';
import { useTracking } from '../../../providers/TrackingProvider';
import { EventName } from '../../../types/Events';
import FieldAutoComplete from '../../common/Filters/FieldAutoComplete';
import FilterConfiguration, { FilterTabs } from '../FilterConfiguration';

type FilterSearchProps = {
    fields: FilterableField[];
    isEditMode: boolean;
    popoverProps?: Pick<PopoverProps, 'onOpen' | 'onClose'>;
    onApply: () => void;
};

const FilterSearch: FC<FilterSearchProps> = ({
    fields,
    isEditMode,
    popoverProps,
    onApply,
}) => {
    const { track } = useTracking();
    const { dashboardTiles, filterableFieldsByTileUuid } =
        useDashboardContext();
    const { addDimensionDashboardFilter } = useDashboardContext();

    const [selectedField, setSelectedField] = useState<FilterableField>();
    const [selectedTabId, setSelectedTabId] = useState<FilterTabs>();

    if (!filterableFieldsByTileUuid) {
        return null;
    }

    const handleChangeField = (field: FilterableField) => {
        if (isField(field) && isFilterableField(field)) {
            setSelectedField(field);
        }
    };

    const handleSave = (
        value: DashboardFilterRule<
            FilterOperator,
            DashboardFieldTarget,
            any,
            any
        >,
    ) => {
        track({
            name: EventName.ADD_FILTER_CLICKED,
            properties: { mode: isEditMode ? 'edit' : 'viewer' },
        });
        addDimensionDashboardFilter(value, !isEditMode);
        onApply();
    };

    const handleBack = () => {
        setSelectedTabId(undefined);
        setSelectedField(undefined);
    };

    return (
        <Box w={selectedTabId === FilterTabs.TILES ? 500 : 350} p="xs">
            {!selectedField ? (
                <FieldAutoComplete
                    label="Select a dimension to filter"
                    id="field-autocomplete"
                    fields={fields}
                    onChange={handleChangeField}
                    popoverProps={popoverProps}
                />
            ) : (
                <FilterConfiguration
                    isEditMode={isEditMode}
                    selectedTabId={selectedTabId}
                    onTabChange={setSelectedTabId}
                    tiles={dashboardTiles}
                    field={selectedField}
                    availableTileFilters={filterableFieldsByTileUuid}
                    popoverProps={popoverProps}
                    onSave={handleSave}
                    onBack={handleBack}
                />
            )}
        </Box>
    );
};

export default FilterSearch;
