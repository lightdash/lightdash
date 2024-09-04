import type { SemanticLayerField } from '@lightdash/common';
import { Group, type GroupProps } from '@mantine/core';
import { forwardRef } from 'react';
import FieldIcon from '../FieldIcon';

interface ItemProps extends GroupProps {
    field: SemanticLayerField;
}

const FilterFieldSelectItem = forwardRef<HTMLDivElement, ItemProps>(
    ({ field, ...others }: ItemProps, ref) => {
        return (
            <Group noWrap ref={ref} {...others}>
                <FieldIcon field={field} />
                {field.label ?? field.name}
            </Group>
        );
    },
);

export default FilterFieldSelectItem;
