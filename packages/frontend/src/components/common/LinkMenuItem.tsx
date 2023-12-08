import { Menu, MenuItemProps } from '@mantine/core';
import React, { FC } from 'react';
import { useHistory } from 'react-router-dom';
import { EventData, useTracking } from '../../providers/TrackingProvider';

export interface LinkMenuItemProps extends MenuItemProps {
    href?: string;
    trackingEvent?: EventData;
    target?: React.HTMLAttributeAnchorTarget;
    forceRefresh?: boolean;
    onClick?: (e: React.MouseEvent<HTMLAnchorElement, MouseEvent>) => void;
}

const LinkMenuItem: FC<LinkMenuItemProps> = ({
    href,
    target,
    trackingEvent,
    forceRefresh = false,
    onClick,
    ...rest
}) => {
    const history = useHistory();
    const { track } = useTracking();

    return (
        <Menu.Item
            component="a"
            {...rest}
            href={href}
            target={target}
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

                onClick?.(e);

                if (trackingEvent) track(trackingEvent);
            }}
        />
    );
};

export default LinkMenuItem;
