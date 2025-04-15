import React from 'react';

import { Flex, Text, Tooltip, useMantineTheme } from '@mantine/core';
import { type Icon as IconType } from '@tabler/icons-react';

const ResourceAttributeCount: React.FC<{
    Icon: IconType;
    count: number;
    name?: string;
}> = ({ Icon, count, name }) => {
    const theme = useMantineTheme();
    const icon = <Icon color={theme.colors.gray[6]} size={14} />;
    return (
        <Flex align="center" gap={4}>
            {name ? (
                <Tooltip withArrow withinPortal label={<Text>{name}</Text>}>
                    {icon}
                </Tooltip>
            ) : (
                icon
            )}

            <Text size={14} color="gray.6" fz="xs">
                {count}
            </Text>
        </Flex>
    );
};

export default ResourceAttributeCount;
