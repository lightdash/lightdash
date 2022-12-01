import { FormGroup } from '@blueprintjs/core';
import { Popover2Props } from '@blueprintjs/popover2';
import {
    DashboardFieldTarget,
    DashboardFilterRule,
    FilterableField,
    FilterOperator,
    isField,
    isFilterableField,
} from '@lightdash/common';
import { FC, useState } from 'react';
import { useDashboardAvailableTileFilters } from '../../../hooks/dashboard/useDashboard';
import { useDashboardContext } from '../../../providers/DashboardProvider';
import { useTracking } from '../../../providers/TrackingProvider';
import { EventName } from '../../../types/Events';
import FieldAutoComplete from '../../common/Filters/FieldAutoComplete';
import FilterConfiguration, { FilterTabs } from '../FilterConfiguration';
import { FilterModalContainer } from './FilterSearch.styles';

type Props = {
    fields: FilterableField[];
    isEditMode: boolean;
    popoverProps?: Popover2Props;
    onClose: () => void;
    onSelectField: (field: FilterableField) => void;
};

const FilterSearch: FC<Props> = ({
    fields,
    isEditMode,
    onClose,
    onSelectField,
    popoverProps,
}) => {
    const { track } = useTracking();
    const { dashboardTiles } = useDashboardContext();
    const { data: availableTileFilters, isLoading } =
        useDashboardAvailableTileFilters(dashboardTiles);
    const { addDimensionDashboardFilter } = useDashboardContext();

    const [selectedField, setSelectedField] = useState<FilterableField>();
    const [selectedTabId, setSelectedTabId] = useState<FilterTabs>();

    if (isLoading || !availableTileFilters) {
        return null;
    }

    const handleChangeField = (field: FilterableField) => {
        if (isField(field) && isFilterableField(field)) {
            setSelectedField(field);
            onSelectField(field);
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
            properties: {
                mode: isEditMode ? 'edit' : 'viewer',
            },
        });
        setSelectedField(undefined);
        addDimensionDashboardFilter(value, !isEditMode);
        setSelectedTabId(undefined);
        onClose();
    };

    const handleBack = () => {
        setSelectedTabId(undefined);
        setSelectedField(undefined);
    };

    return (
        <FilterModalContainer
            $wide={!!selectedField && selectedTabId === 'tiles'}
        >
            {!selectedField ? (
                <FormGroup
                    style={{ marginBottom: 0 }}
                    label={<b>Select a dimension to filter</b>}
                >
                    <FieldAutoComplete
                        fields={fields}
                        onChange={handleChangeField}
                        popoverProps={{
                            lazy: true,
                            matchTargetWidth: true,
                            captureDismiss: !popoverProps?.isOpen,
                            canEscapeKeyClose: !popoverProps?.isOpen,
                            ...popoverProps,
                        }}
                    />
                </FormGroup>
            ) : (
                <FilterConfiguration
                    selectedTabId={selectedTabId}
                    onTabChange={setSelectedTabId}
                    tiles={dashboardTiles}
                    field={selectedField}
                    availableTileFilters={availableTileFilters}
                    popoverProps={{
                        lazy: true,
                        captureDismiss: !popoverProps?.isOpen,
                        canEscapeKeyClose: !popoverProps?.isOpen,
                        ...popoverProps,
                    }}
                    onSave={handleSave}
                    onBack={handleBack}
                />
            )}
        </FilterModalContainer>
    );
};

export default FilterSearch;
