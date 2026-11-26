import { Badge, Box, Group, Radio, Stack, Text } from '@mantine/core';
import { type ReactNode } from 'react';
import { type AgentPermissionChoice } from './agentPermissionDraft';
import { agentPermissionChoiceLabels } from './agentPermissionLabels';
import classes from './AgentPermissionsSection.module.css';

const descriptions: Record<AgentPermissionChoice, string> = {
    person: 'Agents can do everything the person can.',
    custom: 'Choose what agents can do. Agents still never do more than the person can.',
};
const choices: AgentPermissionChoice[] = ['person', 'custom'];
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
}) => (
    <Radio.Group
        value={choice}
        aria-label="Restrict agent actions across organization"
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
                                    <Text fz="sm" fw={500}>
                                        {agentPermissionChoiceLabels[value]}
                                    </Text>
                                    {current === value && (
                                        <Badge size="xs">Current</Badge>
                                    )}
                                </Group>
                                <Text fz="xs" c="dimmed">
                                    {descriptions[value]}
                                </Text>
                            </Stack>
                        </Group>
                    </Radio.Card>
                    {choice === value && value === 'custom' && (
                        <Stack gap="xs" className={classes.choiceBody}>
                            <Text fz="sm" fw={500}>
                                Agents can:
                            </Text>
                            {children}
                        </Stack>
                    )}
                </Box>
            ))}
        </Stack>
    </Radio.Group>
);
