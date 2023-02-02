import { AnchorButton, AnchorButtonProps } from '@blueprintjs/core';
import React, { FC } from 'react';
import { useHistory } from 'react-router-dom';
import { EventData, useTracking } from '../../providers/TrackingProvider';

export interface LinkButtonProps extends AnchorButtonProps {
    href: string;
    trackingEvent?: EventData;
    target?: React.HTMLAttributeAnchorTarget;
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
                if (trackingEvent) track(trackingEvent);

                if (!e.ctrlKey && !e.metaKey && target !== '_blank') {
                    e.preventDefault();
                    history.push(href);
                }
            }}
        />
    );
};

export default LinkButton;
