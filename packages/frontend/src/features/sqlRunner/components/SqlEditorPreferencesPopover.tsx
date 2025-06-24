import { WarehouseTypes } from '@lightdash/common';
import {
    ActionIcon,
    Group,
    Popover,
    SegmentedControl,
    Stack,
    Text,
} from '@mantine/core';
import { IconCodeCircle } from '@tabler/icons-react';
import { type FC, useState } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import {
    type SqlEditorPreferences,
    useSqlEditorPreferences,
} from '../hooks/useSqlEditorPreferences';
import { useAppSelector } from '../store/hooks';

export const SqlEditorPreferencesPopover: FC = () => {
    const [opened, setOpened] = useState(false);
    const warehouseConnectionType = useAppSelector(
        (state) => state.sqlRunner.warehouseConnectionType,
    );
    const [settings, setSettings] = useSqlEditorPreferences(
        warehouseConnectionType,
    );
    const isPopoverDisabled =
        warehouseConnectionType !== WarehouseTypes.SNOWFLAKE;

    const handleQuotePreferenceChange = (
        preference: SqlEditorPreferences['quotePreference'],
    ) => {
        if (settings) {
            setSettings({ ...settings, quotePreference: preference });
        }
    };

    const handleCasePreferenceChange = (
        preference: SqlEditorPreferences['casePreference'],
    ) => {
        if (settings) {
            setSettings({ ...settings, casePreference: preference });
        }
    };

    return (
        <Popover
            opened={opened}
            onClose={() => setOpened(false)}
            withArrow
            shadow="subtle"
            radius="md"
            width={280}
            offset={10}
            withinPortal
            disabled={isPopoverDisabled}
        >
            <Popover.Target>
                <ActionIcon
                    variant="light"
                    size="sm"
                    onClick={() => setOpened(!opened)}
                    sx={{
                        cursor: isPopoverDisabled ? 'default' : 'pointer',
                    }}
                >
                    <MantineIcon
                        color={isPopoverDisabled ? 'gray.6' : 'indigo.6'}
                        icon={IconCodeCircle}
                    />
                </ActionIcon>
            </Popover.Target>
            <Popover.Dropdown>
                {settings && (
                    <Stack spacing="sm">
                        <Text size="xs" fw={500}>
                            Autocomplete preferences
                        </Text>

                        <Group>
                            <Text size="xs" c="dimmed" fw={500}>
                                Quotes
                            </Text>

                            <SegmentedControl
                                size="xs"
                                radius="md"
                                data={[
                                    { label: 'Always', value: 'always' },
                                    { label: 'Never', value: 'never' },
                                ]}
                                value={settings.quotePreference}
                                onChange={(
                                    value: SqlEditorPreferences['quotePreference'],
                                ) => handleQuotePreferenceChange(value)}
                            />
                        </Group>

                        <Group>
                            <Text size="xs" c="dimmed" fw={500}>
                                Casing
                            </Text>
                            <SegmentedControl
                                size="xs"
                                radius="md"
                                data={[
                                    { label: 'Uppercase', value: 'uppercase' },
                                    { label: 'Lowercase', value: 'lowercase' },
                                ]}
                                value={settings.casePreference}
                                onChange={(
                                    value: SqlEditorPreferences['casePreference'],
                                ) => handleCasePreferenceChange(value)}
                            />
                        </Group>
                    </Stack>
                )}
            </Popover.Dropdown>
        </Popover>
    );
};
