import { type StackProps } from '@mantine-8/core';
import { type FC } from 'react';
import SuboptimalState from './SuboptimalState/SuboptimalState';

type EmptyStateLoaderProps = StackProps & {
    title?: string;
    'data-testid'?: string;
};

/**
 * Reusable loading state built on SuboptimalState.
 * Use this whenever you need a centered loading indicator inside a container.
 */
const EmptyStateLoader: FC<EmptyStateLoaderProps> = ({ title, ...rest }) => (
    <SuboptimalState title={title} loading {...rest} />
);

export default EmptyStateLoader;
