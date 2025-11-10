import {
    createPolymorphicComponent,
    Paper,
    type PaperProps,
} from '@mantine-8/core';
import { forwardRef, type Ref } from 'react';

/**
 * A polymorphic component that renders a paper button.
 * This is helpful when you have a group of components you want treated as a button.
 */
export const PolymorphicPaperButton = createPolymorphicComponent<
    'button',
    PaperProps
>(
    forwardRef<HTMLDivElement, PaperProps>(
        (props: PaperProps, ref: Ref<HTMLDivElement>) => (
            <Paper ref={ref} {...props} style={{ cursor: 'pointer' }} />
        ),
    ),
);
