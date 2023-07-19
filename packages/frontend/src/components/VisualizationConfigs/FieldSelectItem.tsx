import { Field, Metric, TableCalculation } from '@lightdash/common';
import { Group, SelectItemProps, Text } from '@mantine/core';
import React, { forwardRef } from 'react';
import FieldIcon from '../common/Filters/FieldIcon';
import FieldLabel from '../common/Filters/FieldLabel';

interface ItemProps extends SelectItemProps {
    icon: React.ReactNode;
    item: Field | Metric | TableCalculation;
    disabled: boolean;
}

const FieldSelectItem = forwardRef<HTMLDivElement, ItemProps>(
    ({ icon, item, disabled, ...rest }: ItemProps, ref) => (
        <div ref={ref} {...rest}>
            <Group spacing="xs" noWrap>
                <FieldIcon item={item} />

                <Text color={disabled ? 'dimmed' : undefined}>
                    <FieldLabel item={item} />
                </Text>
            </Group>
        </div>
    ),
);

export default FieldSelectItem;
