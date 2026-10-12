import { Badge, Box, Group, Radio, Stack, Text } from '@mantine/core';
import { type ReactNode } from 'react';
import { agentPageCapabilityLabels } from './agentCapabilityLabels';
import {
    readAndQueryCapabilities,
    type AgentPermissionChoice,
} from './agentPermissionDraft';
import { agentPermissionChoiceLabels } from './agentPermissionLabels';
import classes from './AgentPermissionsSection.module.css';

const descriptions: Record<AgentPermissionChoice, string> = {
    person: 'Agents can do anything the person can do.',
    read: 'Find content, query data and export results. Agents change nothing.',
    custom: 'Everything starts on. Untick what agents must not do.',
};
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
}) => (
    <Radio.Group value={choice} aria-label="What agents can do">
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
                                        <Badge size="xs">Current</Badge>
                                    )}
                                </Group>
                                <Text size="sm" c="dimmed">
                                    {descriptions[value]}
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
                                        ✓ {agentPageCapabilityLabels[cap].label}
                                    </Badge>
                                ))}
                                <Badge>× Create and edit content</Badge>
                                <Badge>× 6 more</Badge>
                            </Group>
                            <Text size="sm" c="dimmed">
                                Raw SQL runs with the person's warehouse
                                permissions.
                            </Text>
                        </Stack>
                    )}
                </Box>
            ))}
        </Stack>
    </Radio.Group>
);
