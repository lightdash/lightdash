import {
    createPolymorphicComponent,
    Group,
    type GroupProps,
} from '@mantine-8/core';
import { forwardRef, type Ref } from 'react';

/**
 * A polymorphic component that renders a group button.
 * This is helpful when you have a group of components you want treated as a button.
 */
export const PolymorphicGroupButton = createPolymorphicComponent<
    'button',
    GroupProps
>(
    forwardRef<HTMLDivElement, GroupProps>(
        (props: GroupProps, ref: Ref<HTMLDivElement>) => (
            <Group ref={ref} {...props} style={{ cursor: 'pointer' }} />
        ),
    ),
);
