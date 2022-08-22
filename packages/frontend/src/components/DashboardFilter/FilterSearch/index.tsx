import { FilterableField, isField, isFilterableField } from '@lightdash/common';
import { FC, useState } from 'react';
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
    onClose: () => void;
};

const FilterSearch: FC<Props> = ({ fields, onClose, isEditMode }) => {
    const [selectedField, setSelectedField] = useState<FilterableField>();
    const { addDimensionDashboardFilter } = useDashboardContext();
    const { track } = useTracking();

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
                            }
                        }}
                    />
                    <FilterFooter>
                        Filters set on individual charts will be overridden.
                    </FilterFooter>
                </>
            ) : (
                <FilterConfiguration
                    field={selectedField}
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
