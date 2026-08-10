import {
    FilterOperator,
    friendlyName,
    getItemId,
    type FilterDashboardToRule,
} from '@lightdash/common';
import { Menu, Text } from '@mantine/core';
import { IconFilter, IconFilterOff } from '@tabler/icons-react';
import isNil from 'lodash/isNil';
import { Fragment, type FC } from 'react';
import MantineIcon from '../../components/common/MantineIcon';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';

type Props = {
    filters: FilterDashboardToRule[];
    onAddFilter?: (filter: FilterDashboardToRule, isTemporary: boolean) => void;
};

const getExcludeFilter = (
    filter: FilterDashboardToRule,
): FilterDashboardToRule => ({
    ...filter,
    operator:
        filter.operator === FilterOperator.NULL
            ? FilterOperator.NOT_NULL
            : FilterOperator.NOT_EQUALS,
});

export const FilterDashboardTo: FC<Props> = ({ filters, onAddFilter }) => {
    const addDimensionDashboardFilter = useDashboardContext(
        (c) => c.addDimensionDashboardFilter,
    );
    const allFilterableFieldsMap = useDashboardContext(
        (c) => c.allFilterableFieldsMap,
    );
    const addFilterCallback = onAddFilter ?? addDimensionDashboardFilter;
    return (
        <>
            <Menu.Divider />
            <Menu.Label>Filter dashboard to...</Menu.Label>

            {filters.map((filter) => {
                const fieldLabel =
                    Object.values(allFilterableFieldsMap).find(
                        (field) => getItemId(field) === filter.target.fieldId,
                    )?.tableLabel || friendlyName(filter.target.tableName);
                const fieldName = friendlyName(filter.target.fieldName);
                const valueLabel = (
                    <>
                        {filter.operator === FilterOperator.NULL && (
                            <Text span fw={500}>
                                null
                            </Text>
                        )}
                        {filter.values && !isNil(filter.values[0]) && (
                            <Text span fw={500}>
                                {String(filter.values[0])}
                            </Text>
                        )}
                    </>
                );

                return (
                    <Fragment key={filter.id}>
                        <Menu.Item
                            leftSection={<MantineIcon icon={IconFilter} />}
                            onClick={() => addFilterCallback(filter, true)}
                        >
                            {fieldLabel} - {fieldName} is {valueLabel}
                        </Menu.Item>
                        <Menu.Item
                            leftSection={<MantineIcon icon={IconFilterOff} />}
                            onClick={() =>
                                addFilterCallback(
                                    getExcludeFilter(filter),
                                    true,
                                )
                            }
                        >
                            {fieldLabel} - {fieldName} is not {valueLabel}
                        </Menu.Item>
                    </Fragment>
                );
            })}
        </>
    );
};
