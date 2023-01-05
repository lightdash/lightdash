import { NonIdealState } from '@blueprintjs/core';
import {
    AuthorizationError,
    ForbiddenError,
    LightdashError,
    NotExistsError,
} from '@lightdash/common';
import { ComponentProps, FC, useMemo } from 'react';
import styled from 'styled-components';

const DEFAULT_ERROR_PROPS: ComponentProps<typeof NonIdealState> = {
    icon: 'error',
    title: 'Unexpected error',
    description: 'Please contact support',
};

export const StyledNonIdealState = styled(NonIdealState)<{
    $hasMarginTop?: boolean;
}>`
    ${({ $hasMarginTop }) => $hasMarginTop && 'margin-top: 20px;'}
`;

const ErrorState: FC<{
    error?: LightdashError | null;
    hasMarginTop?: boolean;
}> = ({ error, hasMarginTop = true }) => {
    const props = useMemo<ComponentProps<typeof NonIdealState>>(() => {
        if (!error) {
            return DEFAULT_ERROR_PROPS;
        }
        try {
            switch (error.name) {
                case 'ForbiddenError':
                    return {
                        icon: 'lock',
                        title: 'You need access',
                        description: error.message,
                    };
                case 'AuthorizationError':
                    return {
                        icon: 'lock',
                        title: 'Authorization error',
                        description: error.message,
                    };
                case 'NotExistsError':
                    return {
                        icon: 'error',
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

    return <StyledNonIdealState $hasMarginTop={hasMarginTop} {...props} />;
};

export default ErrorState;
