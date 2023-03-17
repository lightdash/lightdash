import { Loader, LoaderProps, Stack, Title } from '@mantine/core';
import React, { FC } from 'react';

export interface NonIdealStateProps extends LoaderProps {
    title: string;
}

const NonIdealState: FC<NonIdealStateProps> = ({ title, ...rest }) => {
    return (
        <Stack my="xl" align="center">
            <Loader size="xl" color="gray" mt="xl" {...rest} />
            <Title order={3} fw={500} color="gray.7">
                {title}
            </Title>
        </Stack>
    );
};

export default NonIdealState;
