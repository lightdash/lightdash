import {
    ActionIcon,
    Group,
    NavLink,
    Popover,
    Stack,
    Text,
} from '@mantine/core';
import {
    IconArrowLeft,
    IconBrush,
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
    isNewChart: boolean;
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
    isNewChart,
    onAttach,
    selectedConnections,
    onSelectConnection,
    onDeselectConnection,
    linkedAppUuid,
}) => {
    const [unlinkConfirmationOpen, setUnlinkConfirmationOpen] = useState(false);
    return (
        <Popover
            opened={
                (panel === 'options' || panel === 'connections') && !disabled
            }
            onChange={(opened) => onPanelChange(opened ? 'options' : null)}
            position="top-start"
            width={300}
            offset={8}
            trapFocus
            returnFocus={panel !== 'theme'}
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
                                Add external connections
                            </Text>
                        </Group>
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
