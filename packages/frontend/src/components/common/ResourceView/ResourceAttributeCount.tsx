import { Flex, Text, Tooltip } from '@mantine-8/core';
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
                <Tooltip withArrow withinPortal label={<Text>{name}</Text>}>
                    <MantineIcon icon={Icon} color="ldGray.6" size={14} />
                </Tooltip>
            ) : (
                <MantineIcon icon={Icon} color="ldGray.6" size={14} />
            )}

            <Text fz="xs" c="ldGray.6">
                {count}
            </Text>
        </Flex>
    );
};

export default ResourceAttributeCount;
