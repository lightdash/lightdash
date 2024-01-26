import { ActionIcon, MantineProvider, Menu } from '@mantine/core';
import { IconCheck, IconDatabaseCog, IconPlus } from '@tabler/icons-react';
import { useMemo, useState } from 'react';
import { useActiveProjectUuid } from '../../hooks/useActiveProject';
import { useProjects } from '../../hooks/useProjects';
import {
    useProjectUserWarehouseCredentialsPreference,
    useProjectUserWarehouseCredentialsPreferenceMutation,
} from '../../hooks/userWarehouseCredentials/useProjectUserWarehouseCredentialsPreference';
import { useUserWarehouseCredentials } from '../../hooks/userWarehouseCredentials/useUserWarehouseCredentials';
import MantineIcon from '../common/MantineIcon';
import { CreateCredentialsModal } from '../UserSettings/MyWarehouseConnectionsPanel/CreateCredentialsModal';

const UserCredentialsSwitcher = () => {
    const [isCreatingCredentials, setIsCreatingCredentials] = useState(false);
    const {
        isInitialLoading: isLoadingCredentials,
        data: userWarehouseCredentials,
    } = useUserWarehouseCredentials();
    const { isInitialLoading: isLoadingProjects, data: projects } =
        useProjects();
    const { isLoading: isLoadingActiveProjectUuid, activeProjectUuid } =
        useActiveProjectUuid();
    const { data: preferredCredentials } =
        useProjectUserWarehouseCredentialsPreference(activeProjectUuid);
    const { mutate } = useProjectUserWarehouseCredentialsPreferenceMutation();

    const activeProject = useMemo(() => {
        return projects?.find((p) => p.projectUuid === activeProjectUuid);
    }, [projects, activeProjectUuid]);

    const compatibleCredentials = useMemo(() => {
        return userWarehouseCredentials?.filter(
            ({ credentials }) =>
                credentials.type === activeProject?.warehouseType,
        );
    }, [userWarehouseCredentials, activeProject]);

    if (
        isLoadingCredentials ||
        isLoadingProjects ||
        isLoadingActiveProjectUuid ||
        !activeProjectUuid ||
        !activeProject?.requireUserCredentials
    ) {
        return null;
    }

    return (
        <>
            <Menu
                withArrow
                shadow="lg"
                position="bottom-end"
                arrowOffset={16}
                offset={-2}
            >
                <Menu.Target>
                    <ActionIcon
                        size="sm"
                        style={{
                            position: 'relative',
                            zIndex: 1,
                        }}
                    >
                        <MantineIcon
                            data-testid="tile-icon-more"
                            icon={IconDatabaseCog}
                        />
                    </ActionIcon>
                </Menu.Target>

                <Menu.Dropdown>
                    {(compatibleCredentials || []).map((item) => (
                        <Menu.Item
                            key={item.uuid}
                            icon={<MantineIcon icon={IconDatabaseCog} />}
                            rightSection={
                                preferredCredentials?.uuid === item.uuid ? (
                                    <MantineIcon icon={IconCheck} />
                                ) : undefined
                            }
                            onClick={() => {
                                mutate({
                                    projectUuid: activeProjectUuid,
                                    userWarehouseCredentialsUuid: item.uuid,
                                });
                            }}
                        >
                            {item.name}
                        </Menu.Item>
                    ))}
                    <Menu.Divider />
                    <Menu.Item
                        icon={<MantineIcon icon={IconPlus} />}
                        onClick={() => {
                            setIsCreatingCredentials(true);
                        }}
                    >
                        Create new
                    </Menu.Item>
                </Menu.Dropdown>
            </Menu>
            {isCreatingCredentials && (
                <MantineProvider inherit theme={{ colorScheme: 'light' }}>
                    <CreateCredentialsModal
                        opened={isCreatingCredentials}
                        warehouseType={activeProject.warehouseType}
                        onSuccess={(data) => {
                            mutate({
                                projectUuid: activeProjectUuid,
                                userWarehouseCredentialsUuid: data.uuid,
                            });
                        }}
                        onClose={() => setIsCreatingCredentials(false)}
                    />
                </MantineProvider>
            )}
        </>
    );
};

export default UserCredentialsSwitcher;
