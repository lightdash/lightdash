import { Stack, Text } from '@mantine/core';
import { type FC } from 'react';

const InvalidSeriesConfiguration: FC<{ itemId: string }> = ({ itemId }) => {
    return (
        <Stack>
            <Text c="ldGray.6">
                Tried to reference field with unknown id: {itemId}
            </Text>
        </Stack>
    );
};

export default InvalidSeriesConfiguration;
