import {
    FilterOperator,
    friendlyName,
    type FilterDashboardToRule,
} from '@lightdash/common';
import { Menu, Text } from '@mantine/core';
import { IconFilter } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../common/MantineIcon';

type Props = {
    filters: FilterDashboardToRule[];
    onAddFilter: (filter: FilterDashboardToRule, isTemporary: boolean) => void;
};

export const FilterDashboardTo: FC<Props> = ({ filters, onAddFilter }) => {
    return (
        <>
            <Menu.Divider />
            <Menu.Label>Filter dashboard to...</Menu.Label>

            {filters.map((filter) => (
                <Menu.Item
                    key={filter.id}
                    icon={<MantineIcon icon={IconFilter} />}
                    onClick={() => onAddFilter(filter, true)}
                >
                    {friendlyName(filter.target.tableName)} -{' '}
                    {friendlyName(filter.target.fieldName)} is{' '}
                    {filter.operator === FilterOperator.NULL && (
                        <Text span fw={500}>
                            null
                        </Text>
                    )}
                    {filter.values && filter.values[0] && (
                        <Text span fw={500}>
                            {String(filter.values[0])}
                        </Text>
                    )}
                </Menu.Item>
            ))}
        </>
    );
};
