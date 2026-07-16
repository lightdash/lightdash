import { WarehouseTypes } from '@lightdash/common';
import { Anchor, Button, Text } from '@mantine-8/core';
import { IconExternalLink } from '@tabler/icons-react';
import React, { type FC } from 'react';
import {
    useIsSnowflakeAuthenticated,
    useSnowflakeLoginPopup,
} from '../../../hooks/useSnowflake';
import { getWarehouseIcon } from '../../ProjectConnection/ProjectConnectFlow/utils';
import MantineIcon from '../MantineIcon';

type Props = {
    onAuthenticated?: (isAuthenticated: boolean) => void;
};

export const SnowflakeOAuthInput: FC<Props> = ({ onAuthenticated }) => {
    const {
        data,
        isInitialLoading,
        error: snowflakeAuthError,
        refetch: refetchAuth,
    } = useIsSnowflakeAuthenticated();

    const isAuthenticated = data !== undefined && snowflakeAuthError === null;

    // Notify parent component when authentication status changes
    React.useEffect(() => {
        if (!isInitialLoading) {
            onAuthenticated?.(isAuthenticated);
        }
    }, [isAuthenticated, isInitialLoading, onAuthenticated]);

    const { mutate: openLoginPopup } = useSnowflakeLoginPopup({
        onLogin: async () => {
            await refetchAuth();
        },
    });

    if (isInitialLoading) {
        return null;
    }

    if (isAuthenticated) {
        return (
            <Text mt="0" c="ldGray.8" fz="xs">
                You are connected to Snowflake,{' '}
                <Anchor
                    href="#"
                    onClick={() => {
                        openLoginPopup();
                    }}
                >
                    Click here to reauthenticate.
                </Anchor>
            </Text>
        );
    }

    return (
        <Button
            size="xs"
            onClick={() => {
                openLoginPopup();
            }}
            variant="default"
            color="ldGray"
            leftSection={getWarehouseIcon(WarehouseTypes.SNOWFLAKE, 'xs')}
            rightSection={
                <MantineIcon icon={IconExternalLink} color="ldGray.6" />
            }
        >
            Sign in with Snowflake
        </Button>
    );
};
