import { Loader, Stack, Title, type LoaderProps } from '@mantine/core';
import React, { type FC } from 'react';

export interface LoadingStateProps extends LoaderProps {
    title: string;
}

const LoadingState: FC<LoadingStateProps> = ({ title, ...rest }) => {
    return (
        <Stack my="xl" align="center">
            <Loader size="xl" color="gray" mt="xl" {...rest} />
            <Title order={3} fw={500} color="gray.7">
                {title}
            </Title>
        </Stack>
    );
};

export default LoadingState;
