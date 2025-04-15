import React from 'react';

import { Flex, Text, useMantineTheme } from '@mantine/core';
import { type Icon as IconType } from '@tabler/icons-react';

const ResourceAttributeCount: React.FC<{ Icon: IconType; count: number }> = ({
    Icon,
    count,
}) => {
    const theme = useMantineTheme();
    return (
        <Flex align="center" gap={4}>
            <Icon color={theme.colors.gray[6]} size={14} />

            <Text size={14} color="gray.6" fz="xs">
                {count}
            </Text>
        </Flex>
    );
};

export default ResourceAttributeCount;
