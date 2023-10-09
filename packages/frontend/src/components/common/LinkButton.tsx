import { AnchorButton, AnchorButtonProps } from '@blueprintjs/core';
import React, { FC } from 'react';
import { useHistory } from 'react-router-dom';
import { EventData, useTracking } from '../../providers/TrackingProvider';

export interface LinkButtonProps extends AnchorButtonProps {
    href: string;
    trackingEvent?: EventData;
    target?: React.HTMLAttributeAnchorTarget;
    forceRefresh?: boolean;
}

const LinkButton: FC<LinkButtonProps> = ({
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
        <AnchorButton
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

export default LinkButton;
