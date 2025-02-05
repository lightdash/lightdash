import {
    isField,
    type DashboardFilters,
    type FilterRule,
    type FilterableItem,
    type WeekDay,
} from '@lightdash/common';
import { type PopoverProps } from '@mantine/core';
import { useCallback, type ReactNode } from 'react';
import { v4 as uuid4 } from 'uuid';
import Context, { type DefaultFieldsMap } from './context';

type Props<T extends DefaultFieldsMap> = {
    projectUuid?: string;
    itemsMap?: T;
    baseTable?: string;
    startOfWeek?: WeekDay;
    dashboardFilters?: DashboardFilters;
    popoverProps?: Omit<PopoverProps, 'children'>;
    children?: ReactNode;
};

const FiltersProvider = <T extends DefaultFieldsMap = DefaultFieldsMap>({
    projectUuid,
    itemsMap = {} as T,
    baseTable,
    startOfWeek,
    dashboardFilters,
    popoverProps,
    children,
}: Props<T>) => {
    const getField = useCallback(
        (filterRule: FilterRule) => {
            if (itemsMap) {
                return itemsMap[filterRule.target.fieldId];
            }
        },
        [itemsMap],
    );
    const getAutocompleteFilterGroup = useCallback(
        (filterId: string, item: FilterableItem) => {
            if (!dashboardFilters || !isField(item)) {
                return undefined;
            }
            return {
                id: uuid4(),
                and: dashboardFilters.dimensions.filter(
                    (dimensionFilterRule) => {
                        const isNotSelectedFilter =
                            dimensionFilterRule.id !== filterId;
                        return isNotSelectedFilter;
                    },
                ),
            };
        },
        [dashboardFilters],
    );
    return (
        <Context.Provider
            value={{
                projectUuid,
                itemsMap,
                startOfWeek,
                baseTable,
                getField,
                getAutocompleteFilterGroup,
                popoverProps,
            }}
        >
            {children}
        </Context.Provider>
    );
};

export default FiltersProvider;
