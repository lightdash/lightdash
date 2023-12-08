import { Menu, MenuItemProps, UnstyledButton } from '@mantine/core';
import React, { FC } from 'react';
import { useHistory } from 'react-router-dom';
import { EventData, useTracking } from '../../providers/TrackingProvider';

export interface LinkMenuItemProps extends MenuItemProps {
    trackingEvent?: EventData;
    target?: React.HTMLAttributeAnchorTarget;
    forceRefresh?: boolean;
    href?: string;
    disabled?: boolean;
}

const LinkMenuItem: FC<LinkMenuItemProps> = ({
    href,
    target,
    trackingEvent,
    forceRefresh = false,
    disabled = false,
    children,
    ...rest
}) => {
    const history = useHistory();
    const { track } = useTracking();

    return (
        <UnstyledButton
            target={target}
            component="a"
            href={disabled ? undefined : href}
        >
            <Menu.Item
                {...rest}
                disabled={disabled}
                onClick={(e) => {
                    if (
                        !forceRefresh &&
                        !e.ctrlKey &&
                        !e.metaKey &&
                        target !== '_blank' &&
                        href
                    ) {
                        e.preventDefault();
                        history.push(href);
                    }

                    if (trackingEvent) track(trackingEvent);
                }}
            >
                {children}
            </Menu.Item>
        </UnstyledButton>
    );
};

export default LinkMenuItem;
