import { Box, Indicator, Tooltip, UnstyledButton } from '@mantine/core';
import { clsx } from 'clsx';
import { forwardRef } from 'react';
import {
    useNavLayout,
    type NavMenuTriggerProps,
} from '../NavBar/NavLayoutContext';
import classes from './AppSidebar.module.css';
import { SidebarNavLink } from './SidebarNavLink';

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
            // The sidebar decides for itself when a label is in sight.
            withLabel: _withLabel,
            className,
            ...buttonProps
        },
        ref,
    ) => {
        const { isCollapsed } = useNavLayout();

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
            <SidebarNavLink
                ref={ref}
                {...buttonProps}
                component="button"
                type="button"
                tooltip={label}
                isTooltipShown={isCollapsed}
                isActive={false}
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
            />
        );
    },
);
