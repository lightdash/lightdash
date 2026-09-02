import {
    createPolymorphicComponent,
    Paper,
    type PaperProps,
} from '@mantine/core';
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
        ({ className, ...props }: PaperProps, ref: Ref<HTMLDivElement>) => (
            // Merge, don't clobber: callers pass their own classes (e.g. the
            // template picker's fan cards) and inline styles on top of the
            // pointer default.
            <Paper
                ref={ref}
                {...props}
                className={className ? `ld-pointer ${className}` : 'ld-pointer'}
            />
        ),
    ),
);
