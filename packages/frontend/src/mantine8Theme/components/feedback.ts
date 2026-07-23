import {
    Alert,
    Dialog,
    Drawer,
    HoverCard,
    Loader,
    LoadingOverlay,
    Modal,
    Notification,
    Overlay,
    Popover,
    RingProgress,
    Skeleton,
    Tooltip,
} from '@mantine-8/core';
import { DotsLoader } from '../../ee/features/aiCopilot/components/ChatElements/DotsLoader/DotsLoader';
import classes from './feedback.module.css';

const popTransition = {
    duration: 160,
    timingFunction: 'var(--app-ease-out)',
    transition: 'pop',
} as const;

const backdrop = { backgroundOpacity: 0.35, blur: 3 } as const;

export const feedbackComponents = {
    Alert: Alert.extend({
        classNames: { root: classes.alert },
        defaultProps: { radius: 'md', variant: 'light' },
        styles: {
            icon: { marginTop: 1 },
            message: {
                color: 'var(--mantine-color-dimmed)',
                fontSize: 'var(--mantine-font-size-sm)',
            },
            title: {
                fontSize: 'var(--mantine-font-size-sm)',
                fontWeight: 600,
                letterSpacing: '-0.006em',
            },
        },
    }),
    Tooltip: Tooltip.extend({
        classNames: { tooltip: classes.tooltip },
        defaultProps: {
            arrowSize: 5,
            fz: 'xs',
            maw: 250,
            multiline: true,
            openDelay: 120,
            radius: 'sm',
            transitionProps: {
                ...popTransition,
                transition: 'fade-down',
            },
            withArrow: true,
            withinPortal: true,
        },
    }),
    RingProgress: RingProgress.extend({
        defaultProps: { roundCaps: true, thickness: 8 },
    }),
    Loader: Loader.extend({
        classNames: { root: classes.loader },
        defaultProps: {
            color: 'ldDark',
            loaders: { ...Loader.defaultLoaders, dots: DotsLoader },
            size: 'sm',
        },
    }),
    Notification: Notification.extend({
        classNames: { root: classes.notification },
        defaultProps: {
            color: 'ldDark',
            radius: 'md',
            withBorder: true,
        },
        styles: {
            description: {
                color: 'var(--mantine-color-dimmed)',
                fontSize: 'var(--mantine-font-size-xs)',
            },
            title: {
                fontSize: 'var(--mantine-font-size-sm)',
                fontWeight: 600,
                letterSpacing: '-0.006em',
            },
        },
    }),
    Modal: Modal.extend({
        classNames: {
            content: classes.modalContent,
            header: classes.overlayHeader,
            overlay: classes.backdrop,
        },
        defaultProps: {
            centered: true,
            overlayProps: backdrop,
            radius: 'lg',
            transitionProps: {
                duration: 180,
                timingFunction: 'var(--app-ease-out)',
                transition: 'fade',
            },
        },
        styles: {
            body: { paddingTop: 'var(--mantine-spacing-sm)' },
            header: { paddingBottom: 'var(--mantine-spacing-sm)' },
            title: {
                fontSize: 'var(--mantine-font-size-md)',
                fontWeight: 600,
                letterSpacing: '-0.01em',
            },
        },
    }),
    Drawer: Drawer.extend({
        classNames: {
            content: classes.drawerContent,
            header: classes.overlayHeader,
            overlay: classes.backdrop,
        },
        defaultProps: {
            overlayProps: backdrop,
            transitionProps: {
                duration: 180,
                timingFunction: 'var(--app-ease-out)',
            },
        },
        styles: {
            title: {
                fontSize: 'var(--mantine-font-size-md)',
                fontWeight: 600,
                letterSpacing: '-0.01em',
            },
        },
    }),
    Popover: Popover.extend({
        classNames: { dropdown: classes.popoverDropdown },
        defaultProps: {
            radius: 'md',
            shadow: 'md',
            transitionProps: popTransition,
            withArrow: false,
            withinPortal: true,
        },
    }),
    HoverCard: HoverCard.extend({
        classNames: { dropdown: classes.popoverDropdown },
        defaultProps: {
            closeDelay: 120,
            openDelay: 160,
            radius: 'md',
            shadow: 'md',
            transitionProps: popTransition,
            withArrow: false,
        },
    }),
    LoadingOverlay: LoadingOverlay.extend({
        defaultProps: {
            loaderProps: { color: 'ldDark', size: 'sm' },
            overlayProps: {
                backgroundOpacity: 0.55,
                blur: 2,
                radius: 'lg',
            },
            transitionProps: { duration: 160 },
        },
    }),
    Overlay: Overlay.extend({
        defaultProps: { backgroundOpacity: 0.4, blur: 2 },
    }),
    Dialog: Dialog.extend({
        classNames: { root: classes.dialog },
        defaultProps: {
            radius: 'lg',
            shadow: 'lg',
            transitionProps: popTransition,
            withBorder: true,
        },
    }),
    Skeleton: Skeleton.extend({ defaultProps: { radius: 'md' } }),
};
