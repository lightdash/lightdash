import { Center, Text } from '@mantine/core';
import { type FC } from 'react';

type Props = {
    message: string;
};

const OmnibarEmptyState: FC<Props> = ({ message }) => {
    return (
        <Center py="xl">
            <Text color="dimmed" size="lg" fw={500}>
                {message}
            </Text>
        </Center>
    );
};

export default OmnibarEmptyState;
