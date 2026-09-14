import { Flex, Text, Tooltip } from '@mantine/core';
import { type Icon as IconType } from '@tabler/icons-react';
import React from 'react';
import MantineIcon from '../MantineIcon';

const ResourceAttributeCount: React.FC<{
    Icon: IconType;
    count: number;
    name?: string;
}> = ({ Icon, count, name }) => {
    return (
        <Flex align="center" gap={4}>
            {name ? (
                <Tooltip
                    label={
                        <Text fz="xs" fw={600}>
                            {name}
                        </Text>
                    }
                >
                    <MantineIcon icon={Icon} color="dimmed" size={14} />
                </Tooltip>
            ) : (
                <MantineIcon icon={Icon} color="dimmed" size={14} />
            )}

            <Text fz="xs" c="dimmed">
                {count}
            </Text>
        </Flex>
    );
};

export default ResourceAttributeCount;
