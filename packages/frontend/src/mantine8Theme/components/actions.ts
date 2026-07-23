import {
    ActionIcon,
    Anchor,
    Button,
    Checkbox,
    Chip,
    CloseButton,
    Kbd,
    Progress,
    Radio,
    Switch,
    type MantineTheme,
} from '@mantine-8/core';
import classes from './actions.module.css';

const customButtonVars = (theme: MantineTheme, variant: string | undefined) => {
    if (variant === 'compact-outline') {
        return {
            root: {
                '--button-bd': `1px solid ${theme.colors.ldGray[2]}`,
            },
        };
    }
    if (variant === 'subtle') {
        return {
            root: {
                '--button-color': theme.colors.ldGray[7],
                '--button-hover': theme.colors.ldGray[1],
            },
        };
    }
    if (variant === 'dark') {
        return {
            root: {
                '--button-bg': theme.colors.ldDark[9],
                '--button-hover': theme.colors.ldDark[8],
                '--button-color': theme.colors.ldGray[0],
                '--button-bd': 'none',
            },
        };
    }

    return { root: {} };
};

export const actionsComponents = {
    ActionIcon: ActionIcon.extend({
        classNames: (_theme, props) => ({
            root: `${classes.actionIcon} ${
                props.variant === 'quiet' ? classes.quiet : ''
            } ${props.variant === 'raised' ? classes.raised : ''}`,
        }),
        defaultProps: { radius: 'md' },
    }),
    Anchor: Anchor.extend({
        classNames: { root: classes.anchor },
        defaultProps: { underline: 'not-hover' },
        styles: {
            root: { fontWeight: 500, letterSpacing: '-0.006em' },
        },
    }),
    Button: Button.extend({
        classNames: (_theme, props) => ({
            root: `${classes.button} ${
                props.variant === 'raised' ? classes.raised : ''
            }`,
        }),
        defaultProps: { radius: 'md', variant: 'filled' },
        styles: {
            root: { fontWeight: 500, letterSpacing: '-0.006em' },
            section: { opacity: 0.9 },
        },
        vars: (theme, props) =>
            customButtonVars(theme, props.variant as string),
    }),
    Checkbox: Checkbox.extend({
        classNames: { input: classes.checkbox },
        defaultProps: {
            iconColor: 'var(--mantine-primary-color-contrast)',
            radius: 'sm',
        },
    }),
    Chip: Chip.extend({
        classNames: { label: classes.chipLabel },
        defaultProps: { radius: 'sm' },
        styles: { label: { fontWeight: 500, letterSpacing: '-0.006em' } },
    }),
    CloseButton: CloseButton.extend({
        classNames: { root: classes.closeButton },
        defaultProps: { radius: 'md' },
    }),
    Kbd: Kbd.extend({ classNames: { root: classes.kbd } }),
    Progress: Progress.extend({
        defaultProps: { color: 'ldDark', radius: 'xl', size: 'sm' },
    }),
    Radio: Radio.extend({
        classNames: { radio: classes.radio },
    }),
    Switch: Switch.extend({
        classNames: {
            input: classes.switchInput,
            thumb: classes.switchThumb,
            track: classes.switchTrack,
        },
        defaultProps: { radius: 'xl' },
    }),
};
