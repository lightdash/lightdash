import { Anchor, Text } from '@mantine/core';
import React, { type FC } from 'react';
import {
    useIsSnowflakeAuthenticated,
    useSnowflakeLoginPopup,
} from '../../../hooks/useSnowflake';

type Props = {
    onAuthenticated?: (isAuthenticated: boolean) => void;
};

export const SnowflakeOAuthInput: FC<Props> = ({ onAuthenticated }) => {
    const {
        data,
        isLoading,
        error: snowflakeAuthError,
        refetch: refetchAuth,
    } = useIsSnowflakeAuthenticated();

    const isAuthenticated = data !== undefined && snowflakeAuthError === null;

    // Notify parent component when authentication status changes
    React.useEffect(() => {
        if (!isLoading) {
            onAuthenticated?.(isAuthenticated);
        }
    }, [isAuthenticated, isLoading, onAuthenticated]);

    const { mutate: openLoginPopup } = useSnowflakeLoginPopup({
        onLogin: async () => {
            await refetchAuth();
        },
    });

    if (isLoading) {
        return null;
    }

    if (isAuthenticated) {
        return (
            <Text mt="0" color="gray" fs="xs">
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
        <Anchor
            size="sm"
            onClick={(e: React.MouseEvent<HTMLAnchorElement>) => {
                e.preventDefault();
                openLoginPopup();
            }}
        >
            Sign in with Snowflake
        </Anchor>
    );
};
