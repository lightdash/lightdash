import {
    Alert,
    Avatar,
    Box,
    Button,
    Flex,
    Group,
    Loader,
    Stack,
    Text,
    Title,
} from '@mantine/core';
import { IconAlertCircle, IconRefresh, IconTrash } from '@tabler/icons-react';
import { type FC } from 'react';
import linearIcon from '../../../svgs/linear-icon.svg';
import {
    useDeleteLinearInstallationMutation,
    useLinearInstallation,
    useLinearTeams,
} from '../../common/LinearIntegration/hooks/useLinearIntegration';
import MantineIcon from '../../common/MantineIcon';
import { SettingsGridCard } from '../../common/Settings/SettingsCard';

const LINEAR_INSTALL_URL = `/api/v1/linear/install`;

const LinearSettingsPanel: FC = () => {
    const installationQuery = useLinearInstallation();
    const teamsQuery = useLinearTeams({
        enabled: !!installationQuery.data,
    });
    const deleteLinearInstallationMutation =
        useDeleteLinearInstallationMutation();

    const isValidLinearInstallation =
        installationQuery.data !== undefined && !installationQuery.isError;

    if (installationQuery.isInitialLoading) {
        return <Loader />;
    }

    return (
        <SettingsGridCard>
            <Box>
                <Group gap="sm">
                    <Avatar src={linearIcon} size="md" alt="" />
                    <Title order={5}>Linear</Title>
                </Group>
            </Box>

            <Stack>
                <Text c="dimmed" fz="xs">
                    Connect Linear so Ask AI can create issues in a workspace
                    team and project when review findings need attention.
                </Text>

                {isValidLinearInstallation && (
                    <Text c="dimmed" fz="xs">
                        Connected to {installationQuery.data.organizationName} (
                        {installationQuery.data.organizationUrlKey}).
                    </Text>
                )}

                {isValidLinearInstallation &&
                    teamsQuery.data &&
                    teamsQuery.data.length === 0 && (
                        <Alert
                            color="blue"
                            icon={<MantineIcon icon={IconAlertCircle} />}
                        >
                            Your Linear integration doesn't have access to any
                            teams.
                        </Alert>
                    )}
                {isValidLinearInstallation &&
                    teamsQuery.data &&
                    teamsQuery.data.length > 0 && (
                        <Text c="dimmed" fz="xs">
                            Your Linear integration has access to the following
                            teams:
                            <ul>
                                {teamsQuery.data.map((team) => (
                                    <li key={team.id}>
                                        {team.name} ({team.key})
                                    </li>
                                ))}
                            </ul>
                        </Text>
                    )}

                {isValidLinearInstallation ? (
                    <Stack align="end">
                        <Group>
                            {/* The install callback upserts, so reconnecting must
                                not delete first — an abandoned OAuth flow would
                                otherwise leave the organization disconnected. */}
                            <Button
                                size="xs"
                                component="a"
                                target="_blank"
                                variant="default"
                                href={LINEAR_INSTALL_URL}
                                leftSection={<MantineIcon icon={IconRefresh} />}
                            >
                                Reconnect
                            </Button>
                            <Button
                                size="xs"
                                px="xs"
                                color="red"
                                variant="outline"
                                onClick={() =>
                                    deleteLinearInstallationMutation.mutate()
                                }
                                leftSection={<MantineIcon icon={IconTrash} />}
                            >
                                Delete
                            </Button>
                        </Group>
                    </Stack>
                ) : (
                    <Flex justify="end">
                        <Button
                            size="xs"
                            component="a"
                            target="_blank"
                            href={LINEAR_INSTALL_URL}
                        >
                            Install
                        </Button>
                    </Flex>
                )}
            </Stack>
        </SettingsGridCard>
    );
};

export default LinearSettingsPanel;
