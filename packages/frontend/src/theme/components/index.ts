import {
    Accordion,
    ActionIcon,
    Alert,
    Avatar,
    Badge,
    Breadcrumbs,
    Button,
    Card,
    Checkbox,
    CloseButton,
    Code,
    Combobox,
    Divider,
    Drawer,
    Fieldset,
    HoverCard,
    Input,
    InputWrapper,
    Kbd,
    List,
    Loader,
    Menu,
    Modal,
    NavLink,
    Notification,
    Pagination,
    Paper,
    PasswordInput,
    Pill,
    Popover,
    type PopoverProps,
    Radio,
    ScrollArea,
    SegmentedControl,
    Skeleton,
    Switch,
    Table,
    Tabs,
    Title,
    Tooltip,
    type MantineTheme,
    type MantineThemeOverride,
} from '@mantine/core';
import { DotsLoader } from '../../ee/features/aiCopilot/components/ChatElements/DotsLoader/DotsLoader';
/* eslint-disable css-modules/no-unused-class */
import accordionClasses from './Accordion.module.css';
import actionIconClasses from './ActionIcon.module.css';
import alertClasses from './Alert.module.css';
import avatarClasses from './Avatar.module.css';
import badgeClasses from './Badge.module.css';
import breadcrumbsClasses from './Breadcrumbs.module.css';
import buttonClasses from './Button.module.css';
import cardClasses from './Card.module.css';
import checkboxClasses from './Checkbox.module.css';
import closeButtonClasses from './CloseButton.module.css';
import codeClasses from './Code.module.css';
import comboboxClasses from './Combobox.module.css';
import dividerClasses from './Divider.module.css';
import fieldsetClasses from './Fieldset.module.css';
import inputClasses from './Input.module.css';
import inputWrapperClasses from './InputWrapper.module.css';
import kbdClasses from './Kbd.module.css';
import menuClasses from './Menu.module.css';
import modalClasses from './Modal.module.css';
import navLinkClasses from './NavLink.module.css';
import notificationClasses from './Notification.module.css';
import paginationClasses from './Pagination.module.css';
import paperClasses from './Paper.module.css';
import pillClasses from './Pill.module.css';
import popoverClasses from './Popover.module.css';
import scrollAreaClasses from './ScrollArea.module.css';
import segmentedControlClasses from './SegmentedControl.module.css';
import skeletonClasses from './Skeleton.module.css';
import switchClasses from './Switch.module.css';
import tableClasses from './Table.module.css';
import tabsClasses from './Tabs.module.css';
import titleClasses from './Title.module.css';
import tooltipClasses from './Tooltip.module.css';
/* eslint-enable css-modules/no-unused-class */

/** Mantine maps md/lg/xl to progressively larger fonts; controls stay at
 *  body size until `lg` so a taller button is not also a louder one. */
const CONTROL_FONT_SIZES: Record<string, keyof MantineTheme['fontSizes']> = {
    md: 'sm',
    lg: 'md',
    xl: 'lg',
};

const controlFontSize = (theme: MantineTheme, size: unknown) => {
    const key = typeof size === 'string' ? CONTROL_FONT_SIZES[size] : undefined;
    return key ? theme.fontSizes[key] : undefined;
};

const isNeutral = (color: unknown) => color === undefined || color === 'gray';

/** Dropdowns pop out of their anchor; Dropdown.module.css sets the origin. */
const dropdownTransition: NonNullable<PopoverProps['transitionProps']> = {
    transition: {
        in: { opacity: 1, transform: 'scale(1)' },
        out: { opacity: 0, transform: 'scale(0.96)' },
        transitionProperty: 'transform, opacity',
    },
    duration: 160,
    exitDuration: 100,
    timingFunction: 'cubic-bezier(0.32, 1.25, 0.6, 1)',
};

/**
 * Component extensions: the app's variants live here, as CSS modules for the
 * visual rules and `vars` callbacks only where Mantine sets an inline
 * variable that CSS cannot win against.
 */
export const themeComponents: MantineThemeOverride['components'] = {
    Button: Button.extend({
        classNames: buttonClasses,
        vars: (theme, props) => {
            const root: Record<string, string | undefined> = {
                '--button-fz': controlFontSize(theme, props.size),
            };
            // Primary ghost: full text color. Explicit `color="gray"` keeps
            // Mantine's muted ghost, so both tones stay available.
            if (props.variant === 'subtle' && props.color === undefined) {
                root['--button-color'] = 'var(--mantine-color-text)';
                root['--button-hover'] = 'var(--mantine-color-default-hover)';
            }
            // Primary `light` is the secondary button: quiet fill, full text.
            if (props.variant === 'light' && isNeutral(props.color)) {
                root['--button-bg'] =
                    'light-dark(var(--mantine-color-gray-1), var(--mantine-color-dark-5))';
                root['--button-hover'] =
                    'light-dark(var(--mantine-color-gray-2), var(--mantine-color-dark-4))';
                root['--button-color'] = 'var(--mantine-color-text)';
            }
            return { root };
        },
    }),

    ActionIcon: ActionIcon.extend({
        defaultProps: {
            variant: 'subtle',
        },
        classNames: actionIconClasses,
        vars: (_theme, props) => {
            // Icon buttons are muted until hovered.
            if (props.variant === 'subtle' && isNeutral(props.color)) {
                return {
                    root: {
                        '--ai-color': 'var(--mantine-color-dimmed)',
                        '--ai-hover': 'var(--mantine-color-default-hover)',
                        '--ai-hover-color': 'var(--mantine-color-text)',
                    },
                };
            }
            if (props.variant === 'transparent' && isNeutral(props.color)) {
                return {
                    root: {
                        '--ai-color': 'var(--mantine-color-dimmed)',
                        '--ai-hover-color': 'var(--mantine-color-text)',
                    },
                };
            }
            return { root: {} };
        },
    }),

    CloseButton: CloseButton.extend({
        classNames: closeButtonClasses,
    }),

    Input: Input.extend({
        classNames: inputClasses,
        vars: (theme, props) => ({
            wrapper: {
                '--input-fz': controlFontSize(theme, props.size),
            },
        }),
    }),

    InputWrapper: InputWrapper.extend({
        classNames: inputWrapperClasses,
    }),

    PasswordInput: PasswordInput.extend({
        defaultProps: {
            // Mantine leaves PasswordInput's size unset, so `--input-fz` never
            // lands and the input falls back to 16px instead of TextInput's 14px.
            size: 'sm',
        },
    }),

    Paper: Paper.extend({
        defaultProps: {
            radius: 'lg',
            shadow: 'none',
            withBorder: true,
        },
        classNames: paperClasses,
    }),

    Card: Card.extend({
        defaultProps: {
            radius: 'lg',
            shadow: 'none',
            withBorder: true,
        },
        classNames: {
            root: paperClasses.root,
            section: cardClasses.section,
        },
    }),

    Badge: Badge.extend({
        defaultProps: {
            variant: 'light',
            color: 'gray',
            radius: 'sm',
        },
        classNames: badgeClasses,
        vars: (_theme, props) => {
            // Neutral `light` badge: quiet fill with readable text.
            if (props.variant === 'light' && isNeutral(props.color)) {
                return {
                    root: {
                        '--badge-bg':
                            'light-dark(var(--mantine-color-gray-1), var(--mantine-color-dark-5))',
                        '--badge-color':
                            'light-dark(var(--mantine-color-gray-7), var(--mantine-color-dark-1))',
                    },
                };
            }
            return { root: {} };
        },
    }),

    Pill: Pill.extend({
        classNames: pillClasses,
    }),

    Avatar: Avatar.extend({
        classNames: avatarClasses,
    }),

    Menu: Menu.extend({
        defaultProps: {
            shadow: 'md',
            withinPortal: true,
        },
        classNames: menuClasses,
    }),

    Popover: Popover.extend({
        defaultProps: {
            shadow: 'md',
            withinPortal: true,
            transitionProps: dropdownTransition,
        },
        classNames: popoverClasses,
    }),

    HoverCard: HoverCard.extend({
        defaultProps: {
            shadow: 'md',
            withinPortal: true,
        },
        classNames: popoverClasses,
    }),

    Combobox: Combobox.extend({
        classNames: comboboxClasses,
    }),

    Tooltip: Tooltip.extend({
        defaultProps: {
            openDelay: 200,
            withinPortal: true,
            withArrow: true,
            arrowSize: 6,
            multiline: true,
            maw: 280,
            radius: 'sm',
        },
        classNames: tooltipClasses,
    }),

    Modal: Modal.extend({
        defaultProps: {
            radius: 'lg',
            centered: true,
        },
        classNames: modalClasses,
    }),

    ModalRoot: {
        defaultProps: {
            radius: 'lg',
        },
    },

    Drawer: Drawer.extend({
        classNames: {
            content: modalClasses.content,
            header: modalClasses.header,
            title: modalClasses.title,
            body: modalClasses.body,
        },
    }),

    Notification: Notification.extend({
        classNames: notificationClasses,
    }),

    Alert: Alert.extend({
        defaultProps: {
            variant: 'light',
        },
        classNames: alertClasses,
    }),

    Table: Table.extend({
        defaultProps: {
            verticalSpacing: 'sm',
            horizontalSpacing: 'md',
        },
        classNames: tableClasses,
    }),

    Tabs: Tabs.extend({
        classNames: tabsClasses,
    }),

    NavLink: NavLink.extend({
        defaultProps: {
            variant: 'subtle',
        },
        classNames: navLinkClasses,
        vars: (_theme, props) => {
            // Mantine writes the variant's colors inline (transparent for
            // `subtle`), so the active fill has to be set here, not in CSS.
            if (props.variant === 'subtle' && props.color === undefined) {
                return {
                    root: {
                        '--nl-bg':
                            'light-dark(rgb(24 24 27 / 0.07), rgb(236 236 238 / 0.09))',
                        '--nl-hover':
                            'light-dark(rgb(24 24 27 / 0.1), rgb(236 236 238 / 0.13))',
                        '--nl-color': 'var(--mantine-color-text)',
                    },
                    children: {},
                };
            }
            return { root: {}, children: {} };
        },
    }),

    SegmentedControl: SegmentedControl.extend({
        classNames: segmentedControlClasses,
    }),

    Accordion: Accordion.extend({
        classNames: (_theme, props) => ({
            item: props.transparentActiveItem
                ? `${accordionClasses.item} ${accordionClasses.transparentActiveItem}`
                : accordionClasses.item,
            control: accordionClasses.control,
            chevron: accordionClasses.chevron,
        }),
    }),

    Checkbox: Checkbox.extend({
        classNames: checkboxClasses,
    }),

    Radio: Radio.extend({
        classNames: {
            radio: checkboxClasses.input,
            label: checkboxClasses.label,
            description: checkboxClasses.description,
        },
    }),

    Switch: Switch.extend({
        classNames: switchClasses,
    }),

    Divider: Divider.extend({
        classNames: dividerClasses,
    }),

    ScrollArea: ScrollArea.extend({
        defaultProps: {
            scrollbarSize: 8,
        },
        classNames: scrollAreaClasses,
    }),

    Skeleton: Skeleton.extend({
        classNames: skeletonClasses,
    }),

    Breadcrumbs: Breadcrumbs.extend({
        classNames: breadcrumbsClasses,
    }),

    Pagination: Pagination.extend({
        classNames: paginationClasses,
    }),

    Title: Title.extend({
        classNames: titleClasses,
    }),

    Kbd: Kbd.extend({
        classNames: kbdClasses,
    }),

    Code: Code.extend({
        classNames: codeClasses,
    }),

    Fieldset: Fieldset.extend({
        defaultProps: {
            radius: 'lg',
        },
        classNames: fieldsetClasses,
    }),

    List: List.extend({
        defaultProps: {
            size: 'sm',
        },
    }),

    Loader: Loader.extend({
        defaultProps: {
            loaders: { ...Loader.defaultLoaders, dots: DotsLoader },
        },
    }),
};
