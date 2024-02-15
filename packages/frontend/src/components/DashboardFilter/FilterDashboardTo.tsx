import {
    DashboardFilterRule,
    FilterOperator,
    friendlyName,
} from '@lightdash/common';
import { Menu, Text } from '@mantine/core';
import { IconFilter } from '@tabler/icons-react';
import { FC } from 'react';
import MantineIcon from '../common/MantineIcon';

type Props = {
    filters: DashboardFilterRule[];
    addFilter: (filter: DashboardFilterRule, isTemporary: boolean) => void;
};

const FilterValue = ({ filter }: { filter: DashboardFilterRule }) => {
    if (filter.operator === FilterOperator.NULL) {
        return (
            <Text span fw={500}>
                null
            </Text>
        );
    }
    if (filter.values)
        return (
            <Text span fw={500}>
                {String(filter.values[0])}
            </Text>
        );

    return null;
};

export const FilterDashboardTo: FC<Props> = ({ filters, addFilter }) => (
    <>
        <Menu.Divider />
        <Menu.Label>Filter dashboard to...</Menu.Label>

        {filters.map((filter) => (
            <Menu.Item
                key={filter.id}
                icon={<MantineIcon icon={IconFilter} />}
                onClick={() => addFilter(filter, true)}
            >
                {friendlyName(filter.target.fieldId)} is{' '}
                <FilterValue filter={filter} />
            </Menu.Item>
        ))}
    </>
);
