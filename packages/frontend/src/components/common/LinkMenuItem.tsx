import { MenuItem2, MenuItem2Props } from '@blueprintjs/popover2';
import React, { FC } from 'react';
import { useHistory } from 'react-router-dom';
import { EventData, useTracking } from '../../providers/TrackingProvider';

export interface LinkMenuItemProps extends MenuItem2Props {
    href: string;
    trackingEvent?: EventData;
    target?: React.HTMLAttributeAnchorTarget;
    forceRefresh?: boolean;
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
        <MenuItem2
            {...rest}
            href={href}
            target={target}
            onClick={(e) => {
                if (
                    !forceRefresh &&
                    !e.ctrlKey &&
                    !e.metaKey &&
                    target !== '_blank'
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
