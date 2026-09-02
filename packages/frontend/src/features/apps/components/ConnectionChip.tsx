import { ActionIcon, Badge } from '@mantine/core';
import { IconPlugConnected, IconX } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';

type Props = {
    name: string;
    onRemove: () => void;
};

const ConnectionChip: FC<Props> = ({ name, onRemove }) => (
    <Badge
        size="md"
        leftSection={<MantineIcon icon={IconPlugConnected} size={12} />}
        rightSection={
            <ActionIcon
                size="xs"
                variant="transparent"
                onClick={onRemove}
                aria-label={`Remove ${name}`}
            >
                <MantineIcon icon={IconX} size={10} />
            </ActionIcon>
        }
    >
        {name}
    </Badge>
);

export default ConnectionChip;
