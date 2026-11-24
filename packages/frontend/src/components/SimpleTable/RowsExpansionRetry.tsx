import { Button, Group, Text } from '@mantine/core';
import { IconAlertCircle, IconRefresh } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../common/MantineIcon';

type Props = {
    onRetry: () => void;
};

const RowsExpansionRetry: FC<Props> = ({ onRetry }) => (
    <Group gap="xs" justify="center" py="xxs" wrap="nowrap">
        <MantineIcon icon={IconAlertCircle} color="ldGray.6" />
        <Text size="xs" c="dimmed">
            The rest of the rows did not load.
        </Text>
        <Button
            size="compact-xs"
            variant="subtle"
            leftSection={<MantineIcon icon={IconRefresh} />}
            onClick={onRetry}
        >
            Retry
        </Button>
    </Group>
);

export default RowsExpansionRetry;
