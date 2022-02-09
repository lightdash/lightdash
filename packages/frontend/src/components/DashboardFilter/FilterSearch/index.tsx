import React, { FC } from 'react';
import { useParams } from 'react-router-dom';
import { useChartConfig } from '../../../hooks/useChartConfig';
import { useSavedChartResults } from '../../../hooks/useQueryResults';
import { useSavedQuery } from '../../../hooks/useSavedQuery';
import { useDashboardContext } from '../../../providers/DashboardProvider';
import FieldAutoComplete from '../../common/Filters/FieldAutoComplete';
import FilterConfiguration from '../FilterConfiguration';
import {
    FilterFooter,
    FilterModalContainer,
    Title,
} from './FilterSearch.styles';

type Props = {
    fields: any;
};

const FilterSearch: FC<Props> = ({ fields }) => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const { dimensionToFilter, setDimensionToFilter } = useDashboardContext();
    const dimensionsUuid: any[] = fields.reduce(
        (prevVal: any, currVal: any) => [
            ...prevVal,
            currVal.properties.savedChartUuid,
        ],

        [],
    );
    const { data } = useSavedQuery({
        id: dimensionsUuid[0] || undefined,
    });

    // @ts-ignore
    const queryResults = useSavedChartResults(projectUuid, data);
    const chartConfig = useChartConfig(
        data?.tableName,
        queryResults.data,
        data?.chartConfig.seriesLayout,
    );

    return (
        <FilterModalContainer>
            {!dimensionToFilter ? (
                <>
                    <Title>Select a dimension to filter</Title>
                    <FieldAutoComplete
                        fields={chartConfig.dimensionOptions}
                        onChange={(field) => setDimensionToFilter(field)}
                    />
                    <FilterFooter>
                        Filters set on individual charts will be overridden.
                    </FilterFooter>
                </>
            ) : (
                <FilterConfiguration />
            )}
        </FilterModalContainer>
    );
};

export default FilterSearch;
