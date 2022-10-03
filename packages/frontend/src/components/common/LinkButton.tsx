import { AnchorButton } from '@blueprintjs/core';
import React, { FC } from 'react';
import { useHistory } from 'react-router-dom';
import { EventData, useTracking } from '../../providers/TrackingProvider';

const LinkButton: FC<
    { href: string; trackingEvent?: EventData } & React.ComponentProps<
        typeof AnchorButton
    >
> = ({ href, target, trackingEvent, ...rest }) => {
    const history = useHistory();
    const { track } = useTracking();
    return (
        <AnchorButton
            {...rest}
            href={href}
            target={target}
            onClick={(e) => {
                if (trackingEvent) {
                    track(trackingEvent);
                }
                if (target === '_blank') return;
                e.preventDefault();
                history.push(href);
            }}
        />
    );
};

export default LinkButton;
