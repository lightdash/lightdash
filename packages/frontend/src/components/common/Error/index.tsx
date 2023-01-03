import { NonIdealState } from '@blueprintjs/core';
import {
    AuthorizationError,
    ForbiddenError,
    LightdashError,
    NotExistsError,
} from '@lightdash/common';
import { ComponentProps, FC, useMemo } from 'react';

const DEFAULT_ERROR_PROPS: ComponentProps<typeof NonIdealState> = {
    icon: 'error',
    title: 'Unexpected error',
};

const Error: FC<{ error: LightdashError }> = ({ error }) => {
    const props = useMemo<ComponentProps<typeof NonIdealState>>(() => {
        try {
            console.log('error', error);
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

    return <NonIdealState {...props} />;
};

export default Error;
