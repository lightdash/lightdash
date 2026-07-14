import { Group, Text } from '@mantine-8/core';
import { IconLock } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../../components/common/MantineIcon';

const TrustNote: FC = () => (
    <Group gap="xs" wrap="nowrap" align="flex-start">
        <MantineIcon icon={IconLock} color="dimmed" />
        <Text size="xs" c="dimmed">
            Secrets are write-only — they're encrypted at rest, used only to
            connect, and never shown again. Access is read-only and revocable at
            any time.
        </Text>
    </Group>
);

export default TrustNote;
