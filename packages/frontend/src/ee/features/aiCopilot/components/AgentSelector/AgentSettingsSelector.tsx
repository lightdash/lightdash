import {
    Avatar,
    Combobox,
    Group,
    Stack,
    Text,
    UnstyledButton,
    useCombobox,
} from '@mantine-8/core';
import { IconChevronDown, IconSettings } from '@tabler/icons-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { LightdashUserAvatar } from '../../../../../components/Avatar';
import MantineIcon from '../../../../../components/common/MantineIcon';
import styles from './AgentSelector.module.css';
import { getAgentOptions, type Agent } from './AgentSelectorUtils';

type Props = {
    agents: Agent[];
    projectUuid: string;
    /** Where the "Ask AI settings" option leads. */
    askAiSettingsHref: string;
    className?: string;
};

const ASK_AI_VALUE = '__ask_ai_settings__';
const DROPDOWN_MIN_WIDTH = 260;

/**
 * Settings entry point for Auto mode: pick between general Ask AI settings and
 * a specific agent's settings. Mirrors the header agent selector's UI.
 */
export const AgentSettingsSelector = ({
    agents,
    projectUuid,
    askAiSettingsHref,
    className,
}: Props) => {
    const navigate = useNavigate();
    const [opened, setOpened] = useState(false);
    const combobox = useCombobox({
        onOpenedChange: setOpened,
        onDropdownClose: () => combobox.resetSelectedOption(),
    });

    const agentOptions = getAgentOptions(agents);

    const handleOptionSubmit = (value: string) => {
        if (value === ASK_AI_VALUE) {
            void navigate(askAiSettingsHref);
        } else {
            void navigate(`/projects/${projectUuid}/ai-agents/${value}/edit`, {
                viewTransition: true,
            });
        }
        combobox.closeDropdown();
    };

    return (
        <Combobox
            store={combobox}
            onOptionSubmit={handleOptionSubmit}
            withinPortal
            width={DROPDOWN_MIN_WIDTH}
            position="bottom-end"
        >
            <Combobox.Target>
                <UnstyledButton
                    type="button"
                    onClick={() => combobox.toggleDropdown()}
                    className={`${styles.target} ${styles.headerTarget} ${
                        className ?? ''
                    }`}
                    data-open={opened ? 'true' : undefined}
                >
                    <Group gap={6} wrap="nowrap" align="center" w="100%">
                        <MantineIcon
                            icon={IconSettings}
                            size="sm"
                            color="ldGray.6"
                        />
                        <Text size="xs" truncate="end" className={styles.label}>
                            Settings
                        </Text>
                        <MantineIcon
                            icon={IconChevronDown}
                            size="sm"
                            color="ldGray.6"
                        />
                    </Group>
                </UnstyledButton>
            </Combobox.Target>

            <Combobox.Dropdown miw={DROPDOWN_MIN_WIDTH}>
                <Combobox.Header p={4} pr={6}>
                    <Combobox.Option value={ASK_AI_VALUE} p={2}>
                        <Group gap="xs" wrap="nowrap" miw={0} flex={1}>
                            <Avatar size={22} color="ldGray" radius="xl">
                                <Text size="10px" fw={700} c="ldGray.6">
                                    AI
                                </Text>
                            </Avatar>
                            <Stack gap={0} flex={1} miw={0}>
                                <Text size="xs" fw={600}>
                                    Ask AI settings
                                </Text>
                                <Text size="xs" c="dimmed" truncate="end">
                                    General settings for all agents
                                </Text>
                            </Stack>
                        </Group>
                    </Combobox.Option>
                </Combobox.Header>
                {agentOptions.length > 0 && (
                    <Combobox.Options className={styles.settingsOptions}>
                        <Combobox.Group label="Agent settings">
                            {agentOptions.map((item) => (
                                <Combobox.Option
                                    value={item.value}
                                    key={item.value}
                                    p={2}
                                    pr={6}
                                >
                                    <Group
                                        gap="xs"
                                        wrap="nowrap"
                                        miw={0}
                                        flex={1}
                                    >
                                        <LightdashUserAvatar
                                            size={22}
                                            name={item.label}
                                            src={item.imageUrl}
                                        />
                                        <Text size="xs" truncate="end" flex={1}>
                                            {item.label}
                                        </Text>
                                    </Group>
                                </Combobox.Option>
                            ))}
                        </Combobox.Group>
                    </Combobox.Options>
                )}
            </Combobox.Dropdown>
        </Combobox>
    );
};
