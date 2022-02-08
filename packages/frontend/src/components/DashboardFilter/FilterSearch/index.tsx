import { MenuItem } from '@blueprintjs/core';
import { ItemRenderer, Suggest } from '@blueprintjs/select';
import { Field, fieldId as getFieldId } from 'common';
import React, { FC } from 'react';
import { useParams } from 'react-router-dom';
import { useChartConfig } from '../../../hooks/useChartConfig';
import { useSavedChartResults } from '../../../hooks/useQueryResults';
import { useSavedQuery } from '../../../hooks/useSavedQuery';
import { useDashboardContext } from '../../../providers/DashboardProvider';
import FilterConfiguration from '../FilterConfiguration';
import {
    DimensionItem,
    DimensionLabel,
    FilterFooter,
    FilterModalContainer,
    Title,
} from './FilterSearch.styles';

const FieldSuggest = Suggest.ofType<Field>();

const renderItem: ItemRenderer<Field> = (field, { modifiers, handleClick }) => {
    if (!modifiers.matchesPredicate) {
        return null;
    }
    return (
        <DimensionLabel
            active={modifiers.active}
            key={getFieldId(field)}
            text={<DimensionItem>{field.label}</DimensionItem>}
            onClick={handleClick}
            shouldDismissPopover={false}
        />
    );
};

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
                    <FieldSuggest
                        inputProps={{ style: { width: '20.5em' } }}
                        items={chartConfig.dimensionOptions}
                        itemsEqual={(value, other) =>
                            getFieldId(value) === getFieldId(other)
                        }
                        inputValueRenderer={(field) => `${field.name}`}
                        popoverProps={{ minimal: true, defaultIsOpen: true }}
                        itemRenderer={renderItem}
                        noResults={<MenuItem disabled text="No results." />}
                        onItemSelect={(field) =>
                            setDimensionToFilter(field.name)
                        }
                        itemPredicate={(
                            query: string,
                            field: Field,
                            index?: undefined | number,
                            exactMatch?: undefined | false | true,
                        ) => {
                            if (exactMatch) {
                                return (
                                    query.toLowerCase() ===
                                    `${field.name}`.toLowerCase()
                                );
                            }
                            return `${field.name}`
                                .toLowerCase()
                                .includes(query.toLowerCase());
                        }}
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
