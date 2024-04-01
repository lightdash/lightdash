import { type LightdashError } from '@lightdash/common';
import { IconAlertCircle, IconLock } from '@tabler/icons-react';
import { useMemo, type ComponentProps, type FC } from 'react';
import SuboptimalState from '../SuboptimalState/SuboptimalState';

const DEFAULT_ERROR_PROPS: ComponentProps<typeof SuboptimalState> = {
    icon: IconAlertCircle,
    title: 'Unexpected error',
    description: 'Please contact support',
};

const ErrorState: FC<{
    error?: LightdashError | null;
    hasMarginTop?: boolean;
}> = ({ error, hasMarginTop = true }) => {
    const props = useMemo<ComponentProps<typeof SuboptimalState>>(() => {
        if (!error) {
            return DEFAULT_ERROR_PROPS;
        }
        try {
            switch (error.name) {
                case 'ForbiddenError':
                    return {
                        icon: IconLock,
                        title: 'You need access',
                        description: error.message,
                    };
                case 'AuthorizationError':
                    return {
                        icon: IconLock,

                        title: 'Authorization error',
                        description: error.message,
                    };
                case 'NotExistsError':
                    return {
                        icon: IconAlertCircle,
                        title: 'Not found',
                        description: error.message,
                    };
                default:
                    return {
                        ...DEFAULT_ERROR_PROPS,
                        description: error.message,
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
