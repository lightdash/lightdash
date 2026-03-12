import { type StackProps } from '@mantine-8/core';
import { type FC } from 'react';
import SuboptimalState from './SuboptimalState/SuboptimalState';

type EmptyStateLoaderProps = StackProps & {
    title?: string;
    description?: string;
    'data-testid'?: string;
};

/**
 * Reusable loading state built on SuboptimalState.
 * Use this whenever you need a centered loading indicator inside a container.
 */
const EmptyStateLoader: FC<EmptyStateLoaderProps> = ({
    title,
    description,
    ...rest
}) => (
    <SuboptimalState
        title={title}
        description={description}
        loading
        {...rest}
    />
);

export default EmptyStateLoader;
