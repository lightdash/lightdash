import type {
    SemanticLayerFilter,
    SemanticLayerTimeFilter,
} from '@lightdash/common';
import { Button, Group, Select, type SelectItem } from '@mantine/core';
import { type FC } from 'react';
import FilterFieldSelectItem from './FilterFieldSelectItem';

type TimeFilterProps = {
    filter: SemanticLayerTimeFilter;
    onUpdate: (filter: SemanticLayerFilter) => void;
    fieldOptions: SelectItem[];
};

const TimeFilter: FC<TimeFilterProps> = ({
    filter,
    onUpdate,
    fieldOptions,
}) => {
    return (
        <Group spacing="xs" w="100%" align="center" noWrap>
            <Select
                size="xs"
                withinPortal
                style={{ flex: 5 }}
                data={fieldOptions}
                itemComponent={FilterFieldSelectItem}
                value={filter.field}
                onChange={(value) => {
                    if (!value) {
                        return;
                    }

                    onUpdate({
                        ...filter,
                        field: value,
                    });
                }}
            />

            <Button size="xs"></Button>
        </Group>
    );
};

export default TimeFilter;
