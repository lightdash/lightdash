import { Text, UnstyledButton } from '@mantine-8/core';
import classes from './text.module.css';

const textVariants: Record<string, string> = {
    body: classes.body,
    eyebrow: classes.eyebrow,
    label: classes.label,
    meta: classes.meta,
    numeric: classes.numeric,
    secondary: classes.secondary,
};

export const textComponents = {
    Text: Text.extend({
        classNames: (_theme, props) => ({
            root: textVariants[props.variant as string],
        }),
        styles: {
            root: { letterSpacing: '-0.006em' },
        },
    }),
    UnstyledButton: UnstyledButton.extend({
        classNames: (_theme, props) => ({
            root: props.variant === 'row' ? classes.row : '',
        }),
    }),
};
