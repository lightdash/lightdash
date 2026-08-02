import {
    createPolymorphicComponent,
    Group,
    type GroupProps,
} from '@mantine-8/core';
import { forwardRef, type Ref } from 'react';
import classes from './PolymorphicGroupButton.module.css';

/**
 * A polymorphic component that renders a group button.
 * This is helpful when you have a group of components you want treated as a button.
 */
export const PolymorphicGroupButton = createPolymorphicComponent<
    'button',
    GroupProps
>(
    forwardRef<HTMLDivElement, GroupProps>(
        ({ className, ...props }: GroupProps, ref: Ref<HTMLDivElement>) => (
            <Group
                ref={ref}
                {...props}
                className={`${classes.reset} ${className ?? ''}`}
            />
        ),
    ),
);
