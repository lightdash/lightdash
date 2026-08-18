import {
    FilterOperator,
    friendlyName,
    type FilterDashboardToRule,
} from '@lightdash/common';
import { Group, Menu, Text } from '@mantine/core';
import { IconFilter, IconFilterX } from '@tabler/icons-react';
import isNil from 'lodash/isNil';
import { Fragment, type FC } from 'react';
import MantineIcon from '../../components/common/MantineIcon';
import TruncatedText from '../../components/common/TruncatedText';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';

const MAX_FILTER_VALUE_WIDTH = 250;

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

                return (
                    <Fragment key={filter.id}>
                        <Menu.Label>
                            Filter dashboard on {fieldName} to
                        </Menu.Label>
                        {(
                            [
                                {
                                    label: 'Show only',
                                    icon: IconFilter,
                                    getFilter: () => filter,
                                },
                                {
                                    label: 'Exclude',
                                    icon: IconFilterX,
                                    getFilter: () => getExcludeFilter(filter),
                                },
                            ] as const
                        ).map(({ label, icon, getFilter }) => (
                            <Menu.Item
                                key={label}
                                leftSection={<MantineIcon icon={icon} />}
                                onClick={() =>
                                    addFilterCallback(getFilter(), true)
                                }
                            >
                                <Group gap={4} wrap="nowrap">
                                    <Text span>{label}</Text>
                                    <TruncatedText
                                        inline
                                        fw={500}
                                        fz="inherit"
                                        maxWidth={MAX_FILTER_VALUE_WIDTH}
                                    >
                                        {valueText}
                                    </TruncatedText>
                                </Group>
                            </Menu.Item>
                        ))}
                    </Fragment>
                );
            })}
        </>
    );
};
