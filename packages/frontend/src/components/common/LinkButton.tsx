import { AnchorButton } from '@blueprintjs/core';
import React, { FC } from 'react';
import { useHistory } from 'react-router-dom';
import { EventData, useTracking } from '../../providers/TrackingProvider';

interface LinkButtonProps extends React.ComponentProps<typeof AnchorButton> {
    href: string;
    trackingEvent?: EventData;
    replace?: boolean;
}

const LinkButton: FC<LinkButtonProps> = ({
    href,
    target,
    trackingEvent,
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
