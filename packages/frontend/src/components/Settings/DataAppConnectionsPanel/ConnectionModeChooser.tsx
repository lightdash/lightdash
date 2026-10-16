import { Group, SimpleGrid, Stack, Text, UnstyledButton } from '@mantine/core';
import { IconAdjustments, IconSparkles } from '@tabler/icons-react';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
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
}) => {
    const { t } = useTranslation('settings');
    return (
        <Stack gap="sm" mt="xl">
            <Text c="dimmed" fz="sm">
                {t('dataAppConnections.wizard.modeChooser.prompt')}
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
                        <Text fw={500}>
                            {t(
                                'dataAppConnections.wizard.modeChooser.describeTitle',
                            )}
                        </Text>
                    </Group>
                    <Text c="dimmed" fz="sm">
                        {aiUnavailable
                            ? t(
                                  'dataAppConnections.wizard.modeChooser.aiNotConfigured',
                              )
                            : t(
                                  'dataAppConnections.wizard.modeChooser.describeDescription',
                              )}
                    </Text>
                </UnstyledButton>
                <UnstyledButton
                    className={classes.card}
                    onClick={() => onChoose('manual')}
                    data-testid="connection-mode-manual"
                >
                    <Group gap="xs" mb={4}>
                        <MantineIcon icon={IconAdjustments} />
                        <Text fw={500}>
                            {t(
                                'dataAppConnections.wizard.modeChooser.manualTitle',
                            )}
                        </Text>
                    </Group>
                    <Text c="dimmed" fz="sm">
                        {t(
                            'dataAppConnections.wizard.modeChooser.manualDescription',
                        )}
                    </Text>
                </UnstyledButton>
            </SimpleGrid>
        </Stack>
    );
};
