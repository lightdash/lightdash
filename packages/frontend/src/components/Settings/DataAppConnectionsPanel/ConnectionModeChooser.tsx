import {
    Group,
    SimpleGrid,
    Stack,
    Text,
    UnstyledButton,
} from '@mantine-8/core';
import { IconAdjustments, IconSparkles } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../common/MantineIcon';
import classes from './ConnectionModeChooser.module.css';

export type ConnectionWizardMode = 'automatic' | 'manual';

type Props = {
    onChoose: (mode: ConnectionWizardMode) => void;
    aiUnavailable: boolean;
};

export const ConnectionModeChooser: FC<Props> = ({
    onChoose,
    aiUnavailable,
}) => (
    <Stack gap="sm" mt="xl">
        <Text c="ldGray.6" fz="sm">
            How would you like to set up the connection?
        </Text>
        <SimpleGrid cols={2} spacing="sm">
            <UnstyledButton
                className={classes.card}
                onClick={() => onChoose('automatic')}
                disabled={aiUnavailable}
                data-testid="connection-mode-automatic"
            >
                <Group gap="xs" mb={4}>
                    <MantineIcon icon={IconSparkles} />
                    <Text fw={500}>Describe it</Text>
                </Group>
                <Text c="ldGray.6" fz="sm">
                    {aiUnavailable
                        ? 'AI is not configured for your organization.'
                        : 'Tell us what you want to connect to and AI drafts the connection for you.'}
                </Text>
            </UnstyledButton>
            <UnstyledButton
                className={classes.card}
                onClick={() => onChoose('manual')}
                data-testid="connection-mode-manual"
            >
                <Group gap="xs" mb={4}>
                    <MantineIcon icon={IconAdjustments} />
                    <Text fw={500}>Set up manually</Text>
                </Group>
                <Text c="ldGray.6" fz="sm">
                    Enter the base URL, authentication, and access rules
                    yourself.
                </Text>
            </UnstyledButton>
        </SimpleGrid>
    </Stack>
);
