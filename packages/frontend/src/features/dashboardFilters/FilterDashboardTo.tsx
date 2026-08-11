import {
    FilterOperator,
    friendlyName,
    type FilterDashboardToRule,
} from '@lightdash/common';
import { Menu, Text } from '@mantine/core';
import { IconFilter, IconFilterX } from '@tabler/icons-react';
import isNil from 'lodash/isNil';
import { Fragment, type FC } from 'react';
import MantineIcon from '../../components/common/MantineIcon';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';

const MAX_FILTER_VALUE_LABEL_LENGTH = 40;

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
    const addFilterCallback = onAddFilter ?? addDimensionDashboardFilter;
    return (
        <>
            <Menu.Divider />

            {filters.map((filter) => {
                const fieldName = friendlyName(filter.target.fieldName);
                const valueText =
                    filter.operator === FilterOperator.NULL
                        ? 'null'
                        : filter.values && !isNil(filter.values[0])
                          ? String(filter.values[0])
                          : '';
                const valueLabel = (
                    <Text span fw={500} title={valueText}>
                        {valueText.length > MAX_FILTER_VALUE_LABEL_LENGTH
                            ? `${valueText.slice(0, MAX_FILTER_VALUE_LABEL_LENGTH)}...`
                            : valueText}
                    </Text>
                );

                return (
                    <Fragment key={filter.id}>
                        <Menu.Label>
                            Filter dashboard on {fieldName} to
                        </Menu.Label>
                        <Menu.Item
                            leftSection={<MantineIcon icon={IconFilter} />}
                            onClick={() => addFilterCallback(filter, true)}
                        >
                            Show only {valueLabel}
                        </Menu.Item>
                        <Menu.Item
                            leftSection={<MantineIcon icon={IconFilterX} />}
                            onClick={() =>
                                addFilterCallback(
                                    getExcludeFilter(filter),
                                    true,
                                )
                            }
                        >
                            Exclude {valueLabel}
                        </Menu.Item>
                    </Fragment>
                );
            })}
        </>
    );
};
