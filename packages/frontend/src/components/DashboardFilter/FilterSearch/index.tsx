import { Popover2Props } from '@blueprintjs/popover2';
import { FilterableField, isField, isFilterableField } from '@lightdash/common';
import React, { FC, useState } from 'react';
import { useDashboardTilesWithFilters } from '../../../hooks/dashboard/useDashboard';
import { useDashboardContext } from '../../../providers/DashboardProvider';
import { useTracking } from '../../../providers/TrackingProvider';
import { EventName } from '../../../types/Events';
import FieldAutoComplete from '../../common/Filters/FieldAutoComplete';
import FilterConfiguration from '../FilterConfiguration';
import {
    FilterFooter,
    FilterModalContainer,
    Title,
} from './FilterSearch.styles';

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
    const { data: tilesWithFilters, isLoading } =
        useDashboardTilesWithFilters(dashboardTiles);
    const { addDimensionDashboardFilter } = useDashboardContext();

    const [selectedField, setSelectedField] = useState<FilterableField>();

    if (isLoading || !tilesWithFilters) {
        return null;
    }

    return (
        <FilterModalContainer>
            {!selectedField ? (
                <>
                    <Title>Select a dimension to filter</Title>

                    <FieldAutoComplete
                        fields={fields}
                        onChange={(field) => {
                            if (isField(field) && isFilterableField(field)) {
                                setSelectedField(field);
                                onSelectField(field);
                            }
                        }}
                        popoverProps={{
                            matchTargetWidth: true,
                            captureDismiss: !popoverProps?.isOpen,
                            canEscapeKeyClose: !popoverProps?.isOpen,
                            ...popoverProps,
                        }}
                    />
                    <FilterFooter>
                        Filters set on individual charts will be overridden.
                    </FilterFooter>
                </>
            ) : (
                <FilterConfiguration
                    field={selectedField}
                    tilesWithFilters={tilesWithFilters}
                    popoverProps={{
                        captureDismiss: true,
                        canEscapeKeyClose: true,
                        ...popoverProps,
                    }}
                    onSave={(value) => {
                        track({
                            name: EventName.ADD_FILTER_CLICKED,
                            properties: {
                                mode: isEditMode ? 'edit' : 'viewer',
                            },
                        });
                        setSelectedField(undefined);
                        addDimensionDashboardFilter(value, !isEditMode);
                        onClose();
                    }}
                    onBack={() => setSelectedField(undefined)}
                />
            )}
        </FilterModalContainer>
    );
};

export default FilterSearch;
