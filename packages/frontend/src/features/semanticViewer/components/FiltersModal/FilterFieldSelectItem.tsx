import type { SemanticLayerField } from '@lightdash/common';
import { Group } from '@mantine/core';
import { forwardRef } from 'react';
import FieldIcon from '../FieldIcon';

interface ItemProps extends React.ComponentPropsWithoutRef<'div'> {
    field: SemanticLayerField;
}

const FilterFieldSelectItem = forwardRef<HTMLDivElement, ItemProps>(
    ({ field, ...others }: ItemProps, ref) => {
        return (
            <div ref={ref} {...others}>
                <Group noWrap>
                    <FieldIcon field={field} />
                    {field.label ?? field.name}
                </Group>
            </div>
        );
    },
);

export default FilterFieldSelectItem;
