import { Stack, Text } from '@mantine/core';
import React, { FC } from 'react';

const InvalidSeriesConfiguration: FC<
    React.PropsWithChildren<{ itemId: string }>
> = ({ itemId }) => {
    return (
        <Stack>
            <Text color="gray.6">
                <span
                    style={{
                        width: '100%',
                    }}
                >
                    Tried to reference field with unknown id: {itemId}
                </span>
            </Text>
        </Stack>
    );
};

export default InvalidSeriesConfiguration;
