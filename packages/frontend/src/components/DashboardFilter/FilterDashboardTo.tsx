import {
    FilterOperator,
    friendlyName,
    getItemId,
    type FilterDashboardToRule,
} from '@lightdash/common';
import { Menu, Text } from '@mantine/core';
import { IconFilter } from '@tabler/icons-react';
import isNil from 'lodash/isNil';
import { type FC } from 'react';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import MantineIcon from '../common/MantineIcon';

type Props = {
    filters: FilterDashboardToRule[];
    onAddFilter?: (filter: FilterDashboardToRule, isTemporary: boolean) => void;
};

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

            {filters.map((filter) => (
                <Menu.Item
                    key={filter.id}
                    icon={<MantineIcon icon={IconFilter} />}
                    onClick={() => addFilterCallback(filter, true)}
                >
                    {Object.values(allFilterableFieldsMap).find(
                        (field) => getItemId(field) === filter.target.fieldId,
                    )?.tableLabel || friendlyName(filter.target.tableName)}{' '}
                    - {friendlyName(filter.target.fieldName)} is{' '}
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
                </Menu.Item>
            ))}
        </>
    );
};
