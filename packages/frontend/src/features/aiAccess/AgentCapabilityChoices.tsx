import { Badge, Box, Group, Radio, Stack, Text } from '@mantine/core';
import { type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { agentPageCapabilityLabels } from './agentCapabilityLabels';
import {
    readAndQueryCapabilities,
    type AgentPermissionChoice,
} from './agentPermissionDraft';
import { agentPermissionChoiceLabels } from './agentPermissionLabels';
import classes from './AgentPermissionsSection.module.css';

const choices: AgentPermissionChoice[] = ['person', 'read', 'custom'];
export const AgentCapabilityChoices = ({
    choice,
    current,
    onChange,
    disabled,
    children,
}: {
    choice: AgentPermissionChoice;
    current: AgentPermissionChoice;
    onChange: (choice: AgentPermissionChoice) => void;
    disabled: boolean;
    children: ReactNode;
}) => {
    const { t } = useTranslation('aiAccess');
    return (
        <Radio.Group
            value={choice}
            aria-label={t('capabilityChoices.ariaLabel')}
        >
            <Stack gap="sm">
                {choices.map((value) => (
                    <Box
                        key={value}
                        className={classes.choice}
                        data-selected={choice === value}
                    >
                        <Radio.Card
                            value={value}
                            aria-label={agentPermissionChoiceLabels[value]}
                            disabled={disabled}
                            onClick={() => onChange(value)}
                            className={classes.choiceControl}
                        >
                            <Group wrap="nowrap" align="flex-start">
                                <Radio.Indicator disabled={disabled} />
                                <Stack gap={0}>
                                    <Group gap="xs">
                                        <Text fw={500}>
                                            {agentPermissionChoiceLabels[value]}
                                        </Text>
                                        {current === value && (
                                            <Badge size="xs">
                                                {t('capabilityChoices.current')}
                                            </Badge>
                                        )}
                                    </Group>
                                    <Text size="sm" c="dimmed">
                                        {t(
                                            `capabilityChoices.descriptions.${value}`,
                                        )}
                                    </Text>
                                </Stack>
                            </Group>
                        </Radio.Card>
                        {choice === value && value === 'custom' && (
                            <Box className={classes.choiceBody}>{children}</Box>
                        )}
                        {choice === value && value === 'read' && (
                            <Stack gap="sm" className={classes.choiceBody}>
                                <Group gap="xs">
                                    {readAndQueryCapabilities.map((cap) => (
                                        <Badge key={cap}>
                                            ✓{' '}
                                            {
                                                agentPageCapabilityLabels[cap]
                                                    .label
                                            }
                                        </Badge>
                                    ))}
                                    <Badge>
                                        {t(
                                            'capabilityChoices.createAndEditOff',
                                        )}
                                    </Badge>
                                    <Badge>
                                        {t('capabilityChoices.moreOff', {
                                            count: 6,
                                        })}
                                    </Badge>
                                </Group>
                                <Text size="sm" c="dimmed">
                                    {t('capabilityChoices.rawSqlNote')}
                                </Text>
                            </Stack>
                        )}
                    </Box>
                ))}
            </Stack>
        </Radio.Group>
    );
};
