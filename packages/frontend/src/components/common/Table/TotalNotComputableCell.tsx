import { Group, Text, Tooltip } from '@mantine/core';
import { IconInfoCircle } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../MantineIcon';

/** A footer cell for a column whose total cannot be computed exactly. */
const TotalNotComputableCell: FC<{ reason: string }> = ({ reason }) => (
    <Tooltip maw={360} multiline label={reason}>
        <Group
            component="span"
            gap={4}
            justify="flex-end"
            wrap="nowrap"
            c="dimmed"
            w="100%"
            style={{ cursor: 'help' }}
            aria-label={`No total: ${reason}`}
        >
            <MantineIcon icon={IconInfoCircle} size={14} />
            <Text component="span" size="xs" c="inherit">
                No total
            </Text>
        </Group>
    </Tooltip>
);

export default TotalNotComputableCell;
