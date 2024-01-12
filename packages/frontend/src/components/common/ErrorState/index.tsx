import { LightdashError } from '@lightdash/common';
import { IconAlertCircle, IconLock } from '@tabler/icons-react';
import { ComponentProps, FC, useMemo } from 'react';
import styled from 'styled-components';
import SuboptimalState from '../SuboptimalState/SuboptimalState';

const DEFAULT_ERROR_PROPS: ComponentProps<typeof SuboptimalState> = {
    icon: IconAlertCircle,
    title: 'Unexpected error',
    description: 'Please contact support',
};

const StyledSuboptimalState = styled(SuboptimalState)<{
    $hasMarginTop?: boolean;
}>`
    ${({ $hasMarginTop }) => $hasMarginTop && 'margin-top: 20px;'}
`;

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

    return <StyledSuboptimalState $hasMarginTop={hasMarginTop} {...props} />;
};

export default ErrorState;
