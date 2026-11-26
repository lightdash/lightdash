import {
    createPolymorphicComponent,
    NavLink,
    Tooltip,
    type NavLinkProps,
} from '@mantine/core';
import { forwardRef } from 'react';
import classes from './AppSidebar.module.css';

type SidebarNavLinkProps = NavLinkProps & {
    /** Names the row while its label is out of sight or cut short. */
    tooltip: string;
    isTooltipShown: boolean;
    isActive: boolean;
};

/** One row of the sidebar: a destination, or a control that opens a menu. */
export const SidebarNavLink = createPolymorphicComponent<
    'a',
    SidebarNavLinkProps
>(
    forwardRef<HTMLAnchorElement, SidebarNavLinkProps>(
        ({ tooltip, isTooltipShown, isActive, ...navLinkProps }, ref) => (
            <Tooltip
                label={tooltip}
                position="right"
                disabled={!isTooltipShown}
            >
                <NavLink
                    ref={ref}
                    {...navLinkProps}
                    active={isActive}
                    aria-current={isActive ? 'page' : undefined}
                    classNames={{
                        root: classes.item,
                        label: classes.itemLabel,
                        section: classes.itemSection,
                    }}
                />
            </Tooltip>
        ),
    ),
);
