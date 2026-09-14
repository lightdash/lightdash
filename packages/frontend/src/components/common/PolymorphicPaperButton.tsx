import {
    createPolymorphicComponent,
    Paper,
    type PaperProps,
} from '@mantine/core';
import { clsx } from 'clsx';
import { forwardRef, type Ref } from 'react';
import classes from './PolymorphicPaperButton.module.css';

/**
 * A polymorphic component that renders a paper button.
 * This is helpful when you have a group of components you want treated as a button.
 */
export const PolymorphicPaperButton = createPolymorphicComponent<
    'button',
    PaperProps
>(
    forwardRef<HTMLDivElement, PaperProps>(
        ({ className, ...props }: PaperProps, ref: Ref<HTMLDivElement>) => (
            <Paper
                ref={ref}
                {...props}
                className={clsx(classes.root, className)}
            />
        ),
    ),
);
