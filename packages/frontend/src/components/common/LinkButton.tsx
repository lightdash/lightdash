import { Button, type ButtonProps } from '@mantine/core';
import { IconTelescope } from '@tabler/icons-react';
import React, { type FC } from 'react';
import { useNavigate } from 'react-router';
import { type EventData } from '../../providers/Tracking/types';
import useTracking from '../../providers/Tracking/useTracking';
import MantineIcon from './MantineIcon';

export interface LinkButtonProps extends ButtonProps {
    href: string;
    trackingEvent?: EventData;
    target?: React.HTMLAttributeAnchorTarget;
    forceRefresh?: boolean;
    onClick?: (e: React.MouseEvent<HTMLAnchorElement, MouseEvent>) => void;
}

const LinkButton: FC<LinkButtonProps> = ({
    href,
    target,
    trackingEvent,
    forceRefresh = false,
    onClick,
    ...rest
}) => {
    const navigate = useNavigate();
    const { track } = useTracking();

    return (
        <Button
            {...rest}
            component="a"
            compact
            variant="subtle"
            href={href}
            leftIcon={<MantineIcon icon={IconTelescope} />}
            target={target}
            onClick={(e: React.MouseEvent<HTMLAnchorElement>) => {
                if (
                    !forceRefresh &&
                    !e.ctrlKey &&
                    !e.metaKey &&
                    target !== '_blank'
                ) {
                    e.preventDefault();
                    void navigate(href);
                }

                onClick?.(e);

                if (trackingEvent) track(trackingEvent);
            }}
        />
    );
};

export default LinkButton;
