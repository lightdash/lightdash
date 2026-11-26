import { Button, Indicator } from '@mantine/core';
import { forwardRef } from 'react';
import classes from './NavBarMenuTrigger.module.css';
import { type NavMenuTriggerProps } from './NavLayoutContext';

/** How the top navbar opens its menus: a compact button. */
export const NavBarMenuTrigger = forwardRef<
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
            withLabel,
            ...buttonProps
        },
        ref,
    ) => (
        <Button
            ref={ref}
            aria-label={label}
            variant="default"
            size="xs"
            classNames={
                variant === 'icon'
                    ? { label: classes.indicatorLabel }
                    : undefined
            }
            {...buttonProps}
        >
            {variant === 'icon' ? (
                <Indicator
                    size={12}
                    color="red"
                    offset={1}
                    disabled={!hasIndicator}
                >
                    {icon}
                </Indicator>
            ) : (
                icon
            )}
            {withLabel && ` ${label}`}
            {badge}
        </Button>
    ),
);
