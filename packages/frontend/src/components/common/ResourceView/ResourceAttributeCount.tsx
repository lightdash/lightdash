import React from 'react';

import { Flex, Text, Tooltip } from '@mantine/core';
import { type Icon as IconType } from '@tabler/icons-react';
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

            <Text size={14} color="ldGray.6" fz="xs">
                {count}
            </Text>
        </Flex>
    );
};

export default ResourceAttributeCount;
