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
    person: 'Agents can do what the person can do in Lightdash, and nothing more.',
    read: 'Agents can find content, query data and export results. They cannot create, change, share or delete content.',
    custom: 'Pick each capability. All start on. Turn off what agents must not do.',
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
    <Radio.Group value={choice} aria-label="Agent scope">
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
                            <Text fz="xs" c="dimmed">
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
