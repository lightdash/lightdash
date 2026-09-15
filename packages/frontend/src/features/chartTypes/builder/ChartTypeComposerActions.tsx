import { type ApiOrganizationDesign } from '@lightdash/common';
import {
    ActionIcon,
    Button,
    Group,
    NavLink,
    Popover,
    ScrollArea,
    Stack,
    Text,
} from '@mantine/core';
import {
    IconArrowLeft,
    IconBrush,
    IconCheck,
    IconChevronRight,
    IconPaperclip,
    IconPlugConnected,
    IconPlus,
} from '@tabler/icons-react';
import { useState, type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import {
    ConnectionPickerView,
    type SelectedConnection,
} from '../../apps/AppResourcePicker';

export type ComposerPanel = 'options' | 'theme' | 'connections' | null;

type Props = {
    panel: ComposerPanel;
    onPanelChange: (panel: ComposerPanel) => void;
    disabled: boolean;
    themeDisabled: boolean;
    themeName: string;
    selectedThemeUuid: string | null;
    themes: Pick<ApiOrganizationDesign, 'designUuid' | 'name' | 'isDefault'>[];
    isNewChart: boolean;
    onThemeChange: (designUuid: string | null) => void;
    onAttach: () => void;
    selectedConnections: SelectedConnection[];
    onSelectConnection: (connection: SelectedConnection) => void;
    onDeselectConnection: (uuid: string) => void;
    linkedAppUuid: string | null;
};

const ChartTypeComposerActions: FC<Props> = ({
    panel,
    onPanelChange,
    disabled,
    themeDisabled,
    themeName,
    selectedThemeUuid,
    themes,
    isNewChart,
    onThemeChange,
    onAttach,
    selectedConnections,
    onSelectConnection,
    onDeselectConnection,
    linkedAppUuid,
}) => {
    const [unlinkConfirmationOpen, setUnlinkConfirmationOpen] = useState(false);
    const changeTheme = (uuid: string | null) => {
        if (themeDisabled) return;
        onThemeChange(uuid);
        onPanelChange(null);
    };
    return (
        <Popover
            opened={panel !== null && !disabled}
            onChange={(opened) => onPanelChange(opened ? 'options' : null)}
            position="top-start"
            width={300}
            offset={8}
            trapFocus
            returnFocus
            closeOnClickOutside={!unlinkConfirmationOpen}
            closeOnEscape={!unlinkConfirmationOpen}
        >
            <Popover.Target>
                <ActionIcon
                    size={30}
                    radius="xl"
                    aria-label="Composer options"
                    disabled={disabled}
                    onClick={() =>
                        onPanelChange(panel === null ? 'options' : null)
                    }
                >
                    <MantineIcon icon={IconPlus} size={16} />
                </ActionIcon>
            </Popover.Target>
            <Popover.Dropdown p="xs">
                {panel === 'options' ? (
                    <Stack gap={0}>
                        <NavLink
                            component="button"
                            label="Attach an image or file"
                            leftSection={<MantineIcon icon={IconPaperclip} />}
                            onClick={() => {
                                onPanelChange(null);
                                onAttach();
                            }}
                        />
                        <NavLink
                            component="button"
                            label="Add external connections"
                            leftSection={
                                <MantineIcon icon={IconPlugConnected} />
                            }
                            rightSection={
                                <MantineIcon icon={IconChevronRight} />
                            }
                            onClick={() => onPanelChange('connections')}
                        />
                        <NavLink
                            component="button"
                            label={isNewChart ? 'Choose theme' : 'Apply theme'}
                            description={themeName}
                            leftSection={<MantineIcon icon={IconBrush} />}
                            rightSection={
                                <MantineIcon icon={IconChevronRight} />
                            }
                            disabled={themeDisabled}
                            attributes={{ root: { disabled: themeDisabled } }}
                            onClick={() => onPanelChange('theme')}
                        />
                    </Stack>
                ) : (
                    <>
                        <Group gap="xs" mb="xs">
                            {panel === 'connections' && (
                                <ActionIcon
                                    aria-label="Back to composer options"
                                    onClick={() => onPanelChange('options')}
                                >
                                    <MantineIcon icon={IconArrowLeft} />
                                </ActionIcon>
                            )}
                            <Text size="sm" fw={500}>
                                {panel === 'theme'
                                    ? isNewChart
                                        ? 'Choose theme'
                                        : 'Apply theme'
                                    : 'Add external connections'}
                            </Text>
                        </Group>
                        {panel === 'theme' && (
                            <>
                                {!isNewChart && (
                                    <Text size="xs" c="dimmed" mb="xs">
                                        Selecting a theme rebuilds this chart
                                        type.
                                    </Text>
                                )}
                                <ScrollArea.Autosize mah={300}>
                                    <Stack gap={0}>
                                        <Button
                                            variant="subtle"
                                            justify="space-between"
                                            disabled={themeDisabled}
                                            attributes={{
                                                root: {
                                                    disabled: themeDisabled,
                                                },
                                            }}
                                            onClick={() => changeTheme(null)}
                                            rightSection={
                                                selectedThemeUuid === null ? (
                                                    <MantineIcon
                                                        icon={IconCheck}
                                                    />
                                                ) : undefined
                                            }
                                        >
                                            No theme
                                        </Button>
                                        {themes.map((theme) => (
                                            <NavLink
                                                component="button"
                                                key={theme.designUuid}
                                                label={theme.name}
                                                description={
                                                    theme.isDefault
                                                        ? 'Default'
                                                        : undefined
                                                }
                                                active={
                                                    selectedThemeUuid ===
                                                    theme.designUuid
                                                }
                                                aria-pressed={
                                                    selectedThemeUuid ===
                                                    theme.designUuid
                                                }
                                                disabled={themeDisabled}
                                                attributes={{
                                                    root: {
                                                        disabled: themeDisabled,
                                                    },
                                                }}
                                                onClick={() =>
                                                    changeTheme(
                                                        theme.designUuid,
                                                    )
                                                }
                                                rightSection={
                                                    selectedThemeUuid ===
                                                    theme.designUuid ? (
                                                        <MantineIcon
                                                            icon={IconCheck}
                                                        />
                                                    ) : undefined
                                                }
                                            />
                                        ))}
                                    </Stack>
                                </ScrollArea.Autosize>
                            </>
                        )}
                        {panel === 'connections' && (
                            <ConnectionPickerView
                                selectedConnections={selectedConnections}
                                onSelect={onSelectConnection}
                                onDeselect={onDeselectConnection}
                                onDone={() => onPanelChange(null)}
                                enabled={!disabled}
                                linkedAppUuid={linkedAppUuid ?? undefined}
                                onUnlinkConfirmationChange={
                                    setUnlinkConfirmationOpen
                                }
                            />
                        )}
                    </>
                )}
            </Popover.Dropdown>
        </Popover>
    );
};

export default ChartTypeComposerActions;
