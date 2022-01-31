import {
    Dimension,
    DimensionType,
    Field,
    FilterGroup,
    FilterGroupOperator,
} from 'common';
import { defaultValuesForNewStringFilter } from '../filters/string-filter/StringFilterForm';
import { useExplorer } from '../providers/ExplorerProvider';

export const useFilters = () => {
    const {
        state: { filters: activeFilters },
        actions: { setFilters },
    } = useExplorer();

    const addFilterGroup = (filterGroup: FilterGroup) =>
        setFilters([...activeFilters, filterGroup]);

    const createFilterGroup = ({
        filters,
        dimension,
    }: {
        filters: any[];
        dimension: Dimension;
    }): FilterGroup => ({
        type: dimension.type,
        tableName: dimension.table,
        fieldName: dimension.name,
        operator: FilterGroupOperator.and,
        filters,
    });

    const isFilteredField = (field: Field) =>
        activeFilters.some(
            (filter) =>
                filter.tableName === field.table &&
                filter.fieldName === field.name,
        );

    const addDefaultFilterForDimension = (dimension: Dimension) => {
        if (isFilteredField(dimension)) {
            return;
        }
        switch (dimension.type) {
            case DimensionType.STRING:
                addFilterGroup(
                    createFilterGroup({
                        dimension,
                        filters: [defaultValuesForNewStringFilter.equals],
                    }),
                );
                break;
            case DimensionType.NUMBER:
                addFilterGroup(
                    createFilterGroup({
                        dimension,
                        filters: [defaultValuesForNewStringFilter.equals],
                    }),
                );
                break;
            case DimensionType.DATE:
                addFilterGroup(
                    createFilterGroup({
                        dimension,
                        filters: [defaultValuesForNewStringFilter.equals],
                    }),
                );
                break;
            case DimensionType.TIMESTAMP:
                addFilterGroup(
                    createFilterGroup({
                        dimension,
                        filters: [defaultValuesForNewStringFilter.equals],
                    }),
                );
                break;
            case DimensionType.BOOLEAN:
                addFilterGroup(
                    createFilterGroup({
                        dimension,
                        filters: [defaultValuesForNewStringFilter.equals],
                    }),
                );
                break;
            default: {
                const nope: never = dimension.type;
                throw Error(
                    `No default filter group implemented for filter group with type ${dimension.type}`,
                );
            }
        }
    };

    return {
        isFilteredField,
        addFilterGroup,
        addDefaultFilterForDimension,
    };
};
