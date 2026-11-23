import {
    Box,
    Indicator,
    NavLink,
    Tooltip,
    UnstyledButton,
} from '@mantine/core';
import { clsx } from 'clsx';
import { forwardRef, useContext } from 'react';
import { type NavMenuTriggerProps } from '../NavBar/NavMenuTriggerContext';
import classes from './AppSidebar.module.css';
import { SidebarCollapsedContext } from './SidebarCollapsedContext';

/** How the navbar's menus are opened from the sidebar: a row, or a lone icon. */
export const SidebarMenuTrigger = forwardRef<
    HTMLButtonElement,
    NavMenuTriggerProps
>(
    (
        {
            icon,
            label,
            hasIndicator,
            badge,
            variant,
            className,
            ...buttonProps
        },
        ref,
    ) => {
        const isCollapsed = useContext(SidebarCollapsedContext);

        if (variant === 'icon') {
            return (
                <Tooltip label={label} position="right">
                    <UnstyledButton
                        ref={ref}
                        {...buttonProps}
                        aria-label={label}
                        className={clsx(classes.iconTrigger, className)}
                    >
                        <Indicator
                            size={8}
                            color="red"
                            offset={2}
                            disabled={!hasIndicator}
                        >
                            {icon}
                        </Indicator>
                        {badge}
                    </UnstyledButton>
                </Tooltip>
            );
        }

        return (
            <Tooltip label={label} position="right" disabled={!isCollapsed}>
                <NavLink
                    ref={ref}
                    {...buttonProps}
                    component="button"
                    type="button"
                    label={label}
                    leftSection={
                        <Box className={classes.triggerIcon}>
                            {icon}
                            {badge}
                        </Box>
                    }
                    rightSection={
                        hasIndicator ? <Box className={classes.dot} /> : null
                    }
                    className={className}
                    classNames={{
                        root: classes.item,
                        label: classes.itemLabel,
                        section: classes.itemSection,
                    }}
                />
            </Tooltip>
        );
    },
);
