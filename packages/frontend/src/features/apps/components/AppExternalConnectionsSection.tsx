import { subject } from '@casl/ability';
import {
    ActionIcon,
    Button,
    Divider,
    Group,
    Select,
    Stack,
    Text,
    TextInput,
} from '@mantine-8/core';
import { IconPlugConnected, IconTrash } from '@tabler/icons-react';
import { type FC, useState } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { useAbilityContext } from '../../../providers/Ability/useAbilityContext';
import useApp from '../../../providers/App/useApp';
import { ExfilWarningCallout } from '../../externalConnections/components/ExfilWarningCallout';
import { useAppExternalConnections } from '../../externalConnections/hooks/useAppExternalConnections';
import { useExternalConnections } from '../../externalConnections/hooks/useExternalConnections';
import { useLinkExternalConnection } from '../../externalConnections/hooks/useLinkExternalConnection';
import { useUnlinkExternalConnection } from '../../externalConnections/hooks/useUnlinkExternalConnection';

type Props = {
    projectUuid: string;
    appUuid: string;
};

const aliasFromName = (name: string): string =>
    name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');

export const AppExternalConnectionsSection: FC<Props> = ({
    projectUuid,
    appUuid,
}) => {
    const ability = useAbilityContext();
    const { user } = useApp();
    const canManage = ability.can(
        'manage',
        subject('ExternalConnection', {
            organizationUuid: user.data?.organizationUuid,
            projectUuid,
        }),
    );

    const { data: connections = [] } = useExternalConnections(
        canManage ? projectUuid : undefined,
    );
    const { data: links = [] } = useAppExternalConnections(
        canManage ? projectUuid : undefined,
        canManage ? appUuid : undefined,
    );
    const { mutateAsync: link, isLoading: isLinking } =
        useLinkExternalConnection();
    const { mutateAsync: unlink } = useUnlinkExternalConnection();

    const [selectedConnectionUuid, setSelectedConnectionUuid] = useState<
        string | null
    >(null);
    const [alias, setAlias] = useState('');

    // Hide entirely from users who can't manage connections.
    if (!canManage) return null;

    const selectedConnection = connections.find(
        (c) => c.externalConnectionUuid === selectedConnectionUuid,
    );

    const handleSelect = (value: string | null) => {
        setSelectedConnectionUuid(value);
        const connection = connections.find(
            (c) => c.externalConnectionUuid === value,
        );
        // Seed the alias from the connection name when none typed yet.
        if (connection && alias.trim().length === 0) {
            setAlias(aliasFromName(connection.name));
        }
    };

    const handleAttach = async () => {
        if (!selectedConnectionUuid || alias.trim().length === 0) return;
        await link({
            projectUuid,
            appUuid,
            externalConnectionUuid: selectedConnectionUuid,
            alias: alias.trim(),
        });
        setSelectedConnectionUuid(null);
        setAlias('');
    };

    return (
        <Stack gap="sm">
            <Group gap="xs">
                <MantineIcon icon={IconPlugConnected} />
                <Text fw={600} fz="sm">
                    External connections
                </Text>
            </Group>

            {links.length > 0 ? (
                <Stack gap={4}>
                    {links.map((linkItem) => {
                        const connection = connections.find(
                            (c) =>
                                c.externalConnectionUuid ===
                                linkItem.externalConnectionUuid,
                        );
                        return (
                            <Group key={linkItem.alias} justify="space-between">
                                <Text fz="sm">
                                    <Text span fw={500}>
                                        {linkItem.alias}
                                    </Text>{' '}
                                    → {connection?.name ?? 'Unknown'}
                                </Text>
                                <ActionIcon
                                    color="red"
                                    variant="subtle"
                                    onClick={() =>
                                        void unlink({
                                            projectUuid,
                                            appUuid,
                                            alias: linkItem.alias,
                                        })
                                    }
                                >
                                    <MantineIcon icon={IconTrash} />
                                </ActionIcon>
                            </Group>
                        );
                    })}
                </Stack>
            ) : (
                <Text fz="xs" c="dimmed">
                    No external connections linked to this app.
                </Text>
            )}

            <Divider />

            <Select
                label="Connection"
                placeholder="Pick a connection"
                value={selectedConnectionUuid}
                onChange={handleSelect}
                data={connections.map((c) => ({
                    value: c.externalConnectionUuid,
                    label: c.name,
                }))}
            />

            {selectedConnection && (
                <ExfilWarningCallout
                    origin={selectedConnection.origin}
                    allowedMethods={selectedConnection.allowedMethods}
                />
            )}

            <TextInput
                label="Alias"
                description="The name the app uses to reference this connection"
                placeholder="my_api"
                value={alias}
                onChange={(event) => setAlias(event.currentTarget.value)}
            />

            <Button
                leftSection={<MantineIcon icon={IconPlugConnected} />}
                disabled={!selectedConnectionUuid || alias.trim().length === 0}
                loading={isLinking}
                onClick={() => void handleAttach()}
            >
                Attach connection
            </Button>
        </Stack>
    );
};
