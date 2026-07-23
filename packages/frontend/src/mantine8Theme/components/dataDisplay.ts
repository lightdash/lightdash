import {
    Avatar,
    Badge,
    Blockquote,
    Card,
    Code,
    Image,
    List,
    Mark,
    Paper,
    Spoiler,
    Table,
    ThemeIcon,
    Timeline,
    Title,
    rem,
    type MantineTheme,
} from '@mantine-8/core';
import classes from './dataDisplay.module.css';

const paperDottedStyles = (theme: MantineTheme) => ({
    border: `1px dashed ${theme.colors.ldGray[3]}`,
    background: 'inherit',
});

export const dataDisplayComponents = {
    Avatar: Avatar.extend({
        classNames: { root: classes.avatarRoot },
        defaultProps: { radius: 'xl' },
        styles: { placeholder: { fontWeight: 500 } },
    }),
    Badge: Badge.extend({
        classNames: (_theme, props) => ({
            root: `${classes.badge} ${
                props.variant === 'chip' ? classes.chip : ''
            }`,
        }),
        defaultProps: { radius: 'sm', variant: 'light' },
        styles: {
            root: {
                fontWeight: 500,
                letterSpacing: '-0.003em',
                textTransform: 'none',
            },
        },
    }),
    Card: Card.extend({
        classNames: { root: classes.card },
        defaultProps: {
            padding: 'md',
            radius: 'lg',
            shadow: 'xs',
            withBorder: true,
        },
        styles: (theme, props) => ({
            root: {
                ...(props.variant === 'dotted' && paperDottedStyles(theme)),
            },
        }),
    }),
    Paper: Paper.extend({
        classNames: (_theme, props) => ({
            root: `${classes.paper} ${
                props.variant === 'panel' ? classes.panel : ''
            } ${props.variant === 'glass' ? classes.glass : ''}`,
        }),
        defaultProps: {
            radius: 'md',
            shadow: 'subtle',
            withBorder: true,
        },
        styles: (theme, props) => ({
            root: {
                ...(props.variant === 'dotted' && paperDottedStyles(theme)),
            },
        }),
    }),
    Table: Table.extend({
        classNames: { table: classes.table },
        defaultProps: {
            highlightOnHover: true,
            horizontalSpacing: 'md',
            striped: false,
            verticalSpacing: 'sm',
            withColumnBorders: false,
        },
        styles: {
            th: {
                color: 'var(--mantine-color-dimmed)',
                fontFamily: 'var(--mantine-font-family-monospace)',
                fontSize: rem(11),
                fontWeight: 500,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
            },
        },
    }),
    ThemeIcon: ThemeIcon.extend({ defaultProps: { radius: 'md' } }),
    Title: Title.extend({
        styles: { root: { letterSpacing: '-0.025em' } },
    }),
    Code: Code.extend({
        styles: {
            root: {
                background: 'var(--mantine-color-default-hover)',
                border: '1px solid var(--app-border)',
                borderRadius: rem(6),
                fontFamily: 'var(--mantine-font-family-monospace)',
            },
        },
    }),
    List: List.extend({ defaultProps: { spacing: 'xs' } }),
    Timeline: Timeline.extend({
        classNames: { itemBullet: classes.timelineBullet },
        defaultProps: {
            bulletSize: 22,
            color: 'ldDark',
            lineWidth: 2,
        },
        styles: {
            itemTitle: { fontSize: rem(13), fontWeight: 600 },
        },
    }),
    Blockquote: Blockquote.extend({
        classNames: { root: classes.blockquote },
        defaultProps: { color: 'ldDark', iconSize: 30, radius: 'md' },
    }),
    Spoiler: Spoiler.extend({
        classNames: { control: classes.spoilerControl },
    }),
    Image: Image.extend({ defaultProps: { radius: 'md' } }),
    Mark: Mark.extend({ classNames: { root: classes.mark } }),
};
