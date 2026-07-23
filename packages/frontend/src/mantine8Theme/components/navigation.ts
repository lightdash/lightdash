import {
    Accordion,
    Breadcrumbs,
    Burger,
    Divider,
    Menu,
    NavLink,
    Pagination,
    ScrollArea,
    SegmentedControl,
    Stepper,
    Tabs,
    Tree,
    rem,
} from '@mantine-8/core';
import classes from './navigation.module.css';

export const navigationComponents = {
    Tabs: Tabs.extend({
        classNames: {
            list: classes.tabsList,
            tab: classes.tabsTab,
        },
        defaultProps: { color: 'ldDark' },
    }),
    Accordion: Accordion.extend({
        classNames: (_theme, props) => ({
            chevron: classes.accordionChevron,
            control: classes.accordionControl,
            item: props.transparentActiveItem
                ? classes.transparentActiveItem
                : '',
        }),
        defaultProps: { chevronPosition: 'right', radius: 'md' },
        styles: {
            content: {
                fontSize: 'var(--mantine-font-size-sm)',
                paddingTop: 4,
            },
            panel: { color: 'var(--mantine-color-dimmed)' },
        },
    }),
    Pagination: Pagination.extend({
        classNames: { control: classes.paginationControl },
        defaultProps: { color: 'ldDark', radius: 'md' },
    }),
    Breadcrumbs: Breadcrumbs.extend({
        classNames: { root: classes.breadcrumbs },
        styles: { separator: { color: 'var(--app-muted)' } },
    }),
    NavLink: NavLink.extend({
        classNames: { root: classes.navLink },
        styles: {
            root: {
                borderRadius: 'var(--mantine-radius-md)',
                padding: '8px 12px',
            },
        },
    }),
    Divider: Divider.extend({
        defaultProps: { color: 'var(--app-border)' },
        styles: {
            label: {
                color: 'var(--mantine-color-dimmed)',
                fontWeight: 500,
            },
        },
    }),
    Stepper: Stepper.extend({
        classNames: {
            separator: classes.stepperSeparator,
            stepIcon: classes.stepperIcon,
        },
        defaultProps: {
            color: 'ldDark',
            iconSize: 30,
            radius: 'xl',
            size: 'sm',
        },
        styles: {
            stepDescription: { color: 'var(--mantine-color-dimmed)' },
            stepLabel: { fontWeight: 500, letterSpacing: '-0.006em' },
        },
    }),
    Menu: Menu.extend({
        classNames: {
            dropdown: classes.menuDropdown,
            item: classes.menuItem,
        },
        defaultProps: {
            radius: 'md',
            shadow: 'md',
            withArrow: false,
        },
        styles: {
            divider: { borderColor: 'var(--app-border)' },
            dropdown: { padding: 4 },
            label: {
                color: 'var(--app-muted)',
                fontSize: rem(11),
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
            },
        },
    }),
    SegmentedControl: SegmentedControl.extend({
        classNames: {
            control: classes.segmentControl,
            indicator: classes.segmentIndicator,
            label: classes.segmentLabel,
            root: classes.segmentRoot,
        },
        defaultProps: { color: 'ldDark', radius: 'md' },
    }),
    Tree: Tree.extend({
        classNames: {
            label: classes.treeLabel,
        },
    }),
    ScrollArea: ScrollArea.extend({
        classNames: { thumb: classes.scrollThumb },
        defaultProps: { scrollbarSize: 8, type: 'hover' },
        styles: { scrollbar: { backgroundColor: 'transparent' } },
    }),
    Burger: Burger.extend({
        classNames: { root: classes.burger },
        defaultProps: { size: 'sm' },
    }),
};
