import { ActionIcon, Box, Button, Popover, Stack, Text } from '@mantine/core';
import {
    IconArrowLeft,
    IconPlugConnected,
    IconPlus,
    IconX,
} from '@tabler/icons-react';
import { useCallback, useMemo, useState, type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import {
    ConnectionPickerView,
    type SelectedConnection,
} from '../../apps/AppResourcePicker';
import appPickerClasses from '../../apps/AppResourcePicker.module.css';
import { useAppExternalConnections } from '../../externalConnections/hooks/useAppExternalConnections';
import { useLinkAppExternalConnection } from '../../externalConnections/hooks/useLinkAppExternalConnection';
import { useUnlinkAppExternalConnection } from '../../externalConnections/hooks/useUnlinkAppExternalConnection';
import classes from './ChartTypeConnectionsButton.module.css';

type Props = {
    projectUuid: string;
    appUuid: string;
};

/**
 * Manage connections linked to this chart type without a rebuild. Linking
 * unlocks allowed image origins in the sandbox CSP immediately; a later
 * iterate still sees every linked connection.
 */
const ChartTypeConnectionsButton: FC<Props> = ({ projectUuid, appUuid }) => {
    const [opened, setOpened] = useState(false);
    const [view, setView] = useState<'list' | 'add'>('list');
    const { data: links = [] } = useAppExternalConnections(
        projectUuid,
        appUuid,
    );
    const { mutate: linkConnection, isLoading: isLinking } =
        useLinkAppExternalConnection();
    const { mutate: unlinkConnection, isLoading: isUnlinking } =
        useUnlinkAppExternalConnection();
    const isBusy = isLinking || isUnlinking;

    const selectedConnections: SelectedConnection[] = useMemo(
        () =>
            links.map((item) => ({
                externalConnectionUuid: item.connection.externalConnectionUuid,
                name: item.connection.name,
                alias: item.alias,
            })),
        [links],
    );

    const handleOpenChange = useCallback((isOpen: boolean) => {
        setOpened(isOpen);
        if (!isOpen) setView('list');
    }, []);

    const handleSelect = useCallback(
        (connection: SelectedConnection) => {
            if (isBusy) return;
            linkConnection({
                projectUuid,
                appUuid,
                externalConnectionUuid: connection.externalConnectionUuid,
                alias: connection.alias,
            });
        },
        [appUuid, isBusy, linkConnection, projectUuid],
    );

    const handleUnlink = useCallback(
        (alias: string) => {
            unlinkConnection({ projectUuid, appUuid, alias });
        },
        [appUuid, projectUuid, unlinkConnection],
    );

    const handleDeselect = useCallback(
        (uuid: string) => {
            const linked = links.find(
                (item) => item.connection.externalConnectionUuid === uuid,
            );
            if (!linked) return;
            handleUnlink(linked.alias);
        },
        [handleUnlink, links],
    );

    return (
        <Popover
            opened={opened}
            onChange={handleOpenChange}
            position="bottom-end"
            offset={8}
            shadow="md"
            trapFocus
        >
            <Popover.Target>
                <Button
                    size="xs"
                    variant="default"
                    leftSection={
                        <MantineIcon icon={IconPlugConnected} size={15} />
                    }
                    onClick={() => setOpened((value) => !value)}
                    aria-label="Manage external connections"
                >
                    {links.length > 0
                        ? `${links.length} connection${
                              links.length === 1 ? '' : 's'
                          }`
                        : 'Connections'}
                </Button>
            </Popover.Target>
            <Popover.Dropdown className={appPickerClasses.queryDropdown} p={0}>
                {view === 'add' ? (
                    <>
                        <Box
                            p="xs"
                            pb={0}
                            className={appPickerClasses.attachPickerHeader}
                        >
                            <ActionIcon
                                variant="subtle"
                                size="sm"
                                onClick={() => setView('list')}
                                aria-label="Back to linked connections"
                            >
                                <MantineIcon icon={IconArrowLeft} size={14} />
                            </ActionIcon>
                            <Box>
                                <Text size="sm" fw={500}>
                                    Add external connections
                                </Text>
                                <Text size="xs" c="dimmed">
                                    Origins with public images enabled can
                                    render in image URL fields
                                </Text>
                            </Box>
                        </Box>
                        <ConnectionPickerView
                            selectedConnections={selectedConnections}
                            onSelect={handleSelect}
                            onDeselect={handleDeselect}
                            onDone={() => setView('list')}
                            enabled={opened}
                        />
                    </>
                ) : (
                    <Stack gap="xs" p="xs">
                        <Box>
                            <Text size="sm" fw={500}>
                                Linked connections
                            </Text>
                            <Text size="xs" c="dimmed">
                                Used for API fetches and, when enabled, public
                                images in this chart type
                            </Text>
                        </Box>
                        {links.length === 0 ? (
                            <Text size="xs" c="dimmed">
                                No connections linked yet
                            </Text>
                        ) : (
                            <Stack gap={4}>
                                {links.map((item) => (
                                    <Box
                                        key={item.alias}
                                        className={classes.linkRow}
                                    >
                                        <Box className={classes.linkCopy}>
                                            <Text size="xs" fw={500} truncate>
                                                {item.connection.name}
                                            </Text>
                                            <Text size="xs" c="dimmed" truncate>
                                                {item.connection.origin}
                                                {item.connection.type ===
                                                    'none' &&
                                                item.connection
                                                    .allowBrowserImages
                                                    ? ' · public images'
                                                    : ''}
                                            </Text>
                                        </Box>
                                        <ActionIcon
                                            variant="subtle"
                                            color="ldGray"
                                            size="xs"
                                            aria-label={`Unlink ${item.connection.name}`}
                                            onClick={() =>
                                                handleUnlink(item.alias)
                                            }
                                            disabled={isBusy}
                                        >
                                            <MantineIcon
                                                icon={IconX}
                                                size={14}
                                            />
                                        </ActionIcon>
                                    </Box>
                                ))}
                            </Stack>
                        )}
                        <Button
                            size="compact-xs"
                            variant="default"
                            leftSection={
                                <MantineIcon icon={IconPlus} size={14} />
                            }
                            onClick={() => setView('add')}
                        >
                            Add connection
                        </Button>
                    </Stack>
                )}
            </Popover.Dropdown>
        </Popover>
    );
};

export default ChartTypeConnectionsButton;
