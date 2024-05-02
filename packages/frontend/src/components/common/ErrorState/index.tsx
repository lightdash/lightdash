import { type ApiErrorDetail } from '@lightdash/common';
import { Text } from '@mantine/core';
import { IconAlertCircle, IconLock } from '@tabler/icons-react';
import React, { useMemo, type ComponentProps, type FC } from 'react';
import SuboptimalState from '../SuboptimalState/SuboptimalState';

const DEFAULT_ERROR_PROPS: ComponentProps<typeof SuboptimalState> = {
    icon: IconAlertCircle,
    title: 'Unexpected error',
    description: 'Please contact support',
};

const ErrorState: FC<{
    error?: ApiErrorDetail | null;
    hasMarginTop?: boolean;
}> = ({ error, hasMarginTop = true }) => {
    const props = useMemo<ComponentProps<typeof SuboptimalState>>(() => {
        if (!error) {
            return DEFAULT_ERROR_PROPS;
        }
        try {
            const description = (
                <>
                    <Text maw={400}>{error.message}</Text>
                    {error.id && (
                        <Text maw={400} weight="bold">
                            You can contact support with the following error ID {error.id}
                        </Text>
                    )}
                </>
            );
            switch (error.name) {
                case 'ForbiddenError':
                    return {
                        icon: IconLock,
                        title: 'You need access',
                        description,
                    };
                case 'AuthorizationError':
                    return {
                        icon: IconLock,
                        title: 'Authorization error',
                        description,
                    };
                case 'NotExistsError':
                    return {
                        icon: IconAlertCircle,
                        title: 'Not found',
                        description,
                    };
                default:
                    return {
                        ...DEFAULT_ERROR_PROPS,
                        description,
                    };
            }
        } catch {
            return DEFAULT_ERROR_PROPS;
        }
    }, [error]);

    return (
        <SuboptimalState
            sx={{ marginTop: hasMarginTop ? '20px' : undefined }}
            {...props}
        />
    );
};

export default ErrorState;
