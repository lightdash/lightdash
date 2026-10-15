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
    IconChevronRight,
    IconPaperclip,
    IconPlugConnected,
    IconPlus,
} from '@tabler/icons-react';
import { useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';
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
    onAttach,
    selectedConnections,
    onSelectConnection,
    onDeselectConnection,
    linkedAppUuid,
}) => {
    const { t } = useTranslation('chartTypes');
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
                    aria-label={t('composer.options')}
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
                            label={t('composer.attachFile')}
                            leftSection={<MantineIcon icon={IconPaperclip} />}
                            onClick={() => {
                                onPanelChange(null);
                                onAttach();
                            }}
                        />
                        <NavLink
                            component="button"
                            label={t('composer.addConnections')}
                            leftSection={
                                <MantineIcon icon={IconPlugConnected} />
                            }
                            rightSection={
                                <MantineIcon icon={IconChevronRight} />
                            }
                            onClick={() => onPanelChange('connections')}
                        />
                    </Stack>
                ) : (
                    <>
                        <Group gap="xs" mb="xs">
                            {panel === 'connections' && (
                                <ActionIcon
                                    aria-label={t('composer.backToOptions')}
                                    onClick={() => onPanelChange('options')}
                                >
                                    <MantineIcon icon={IconArrowLeft} />
                                </ActionIcon>
                            )}
                            <Text size="sm" fw={500}>
                                {t('composer.addConnections')}
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
