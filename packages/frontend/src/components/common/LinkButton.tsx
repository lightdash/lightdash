import { Button, type ButtonProps } from '@mantine-8/core';
import { IconTelescope, type Icon } from '@tabler/icons-react';
import React, { type FC } from 'react';
import { useNavigate } from 'react-router';
import { type EventData } from '../../providers/Tracking/types';
import useTracking from '../../providers/Tracking/useTracking';
import MantineIcon from './MantineIcon';

export interface LinkButtonProps extends Omit<ButtonProps, 'leftSection'> {
    href: string;
    trackingEvent?: EventData;
    target?: React.HTMLAttributeAnchorTarget;
    forceRefresh?: boolean;
    onClick?: (e: React.MouseEvent<HTMLAnchorElement, MouseEvent>) => void;
    leftIcon?: Icon;
}

const LinkButton: FC<LinkButtonProps> = ({
    href,
    target,
    trackingEvent,
    forceRefresh = false,
    onClick,
    leftIcon = IconTelescope,
    ...rest
}) => {
    const navigate = useNavigate();
    const tracking = useTracking({ failSilently: true });

    return (
        <Button
            variant="subtle"
            {...rest}
            component="a"
            size="compact-sm"
            href={href}
            leftSection={leftIcon && <MantineIcon icon={leftIcon} />}
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

                if (trackingEvent && tracking) tracking.track(trackingEvent);
            }}
        />
    );
};

export default LinkButton;
