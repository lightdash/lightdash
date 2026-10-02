import { allowsOptionalUserCredentials } from '@lightdash/common';
import { Button, getDefaultZIndex, Menu, Text } from '@mantine/core';
import { IconCheck, IconDatabaseCog, IconPlus } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { matchRoutes, useLocation } from 'react-router';
import { useActiveProjectUuid } from '../../hooks/useActiveProject';
import { useProject } from '../../hooks/useProject';
import {
    useProjectUserWarehouseCredentialsPreference,
    useProjectUserWarehouseCredentialsPreferenceMutation,
} from '../../hooks/userWarehouseCredentials/useProjectUserWarehouseCredentialsPreference';
import { useProjectUserWarehouseCredentials } from '../../hooks/userWarehouseCredentials/useUserWarehouseCredentials';
import { warehouseSignInStatusQueryKey } from '../../hooks/useWarehouseSignInStatus';
import useApp from '../../providers/App/useApp';
import MantineIcon from '../common/MantineIcon';
import { getWarehouseLabel } from '../ProjectConnection/ProjectConnectFlow/utils';
import { CreateCredentialsModal } from '../UserSettings/MyWarehouseConnectionsPanel/CreateCredentialsModal';
import AppColorSchemeScope from './AppColorSchemeScope';
import { useNavBarMenuProps } from './NavBarPortalContext';
import { routesThatNeedWarehouseCredentials } from './routesThatNeedWarehouseCredentials';
import { usePersonalSignInPrompt } from './usePersonalSignInPrompt';

const UserCredentialsSwitcher = () => {
    const menuProps = useNavBarMenuProps();
    const { user } = useApp();
    const location = useLocation();
    const isRouteThatNeedsWarehouseCredentials = !!matchRoutes(
        routesThatNeedWarehouseCredentials.map((path) => ({ path })),
        location,
    );
    const queryClient = useQueryClient();

    const { isLoading: isLoadingActiveProjectUuid, activeProjectUuid } =
        useActiveProjectUuid();
    const { data: activeProject, isInitialLoading: isLoadingActiveProject } =
        useProject(activeProjectUuid);
    const {
        isInitialLoading: isLoadingCredentials,
        data: userWarehouseCredentials,
    } = useProjectUserWarehouseCredentials(activeProjectUuid);
    const { data: preferredCredentials } =
        useProjectUserWarehouseCredentialsPreference(activeProjectUuid);
    const compatibleCredentials = useMemo(() => {
        return userWarehouseCredentials?.filter(
            ({ credentials }) =>
                credentials.type === activeProject?.warehouseConnection?.type,
        );
    }, [userWarehouseCredentials, activeProject]);

    const {
        showCreateModalOnPageLoad,
        isCreatingCredentials,
        setIsCreatingCredentials,
        isExpiredSignIn,
        setIsExpiredSignIn,
    } = usePersonalSignInPrompt({
        activeProjectUuid,
        warehouseType: activeProject?.warehouseConnection?.type,
        requireUserCredentials:
            activeProject?.warehouseConnection?.requireUserCredentials,
        pathname: location.pathname,
        isRouteThatNeedsWarehouseCredentials,
        compatibleCredentialsCount: compatibleCredentials?.length,
    });

    const { mutate } = useProjectUserWarehouseCredentialsPreferenceMutation({
        onSuccess: () => {
            if (isExpiredSignIn && activeProjectUuid) {
                queryClient.removeQueries({
                    queryKey: warehouseSignInStatusQueryKey(activeProjectUuid),
                });
                void queryClient.invalidateQueries().then(() => {
                    window.dispatchEvent(
                        new CustomEvent('warehouse-sign-in-reconnected', {
                            detail: activeProjectUuid,
                        }),
                    );
                });
            } else if (isRouteThatNeedsWarehouseCredentials) {
                // reload page because we can't invalidate the results mutation
                window.location.reload();
            }
        },
    });

    // Show the switcher when personal credentials are mandatory, or when they
    // are optional for this warehouse type and the user already has some
    const isSwitcherVisible =
        activeProject?.warehouseConnection?.requireUserCredentials ||
        (allowsOptionalUserCredentials(activeProject?.warehouseConnection) &&
            !!compatibleCredentials?.length);

    if (
        isLoadingCredentials ||
        isLoadingActiveProject ||
        isLoadingActiveProjectUuid ||
        !activeProjectUuid ||
        !activeProject ||
        !isSwitcherVisible
    ) {
        return null;
    }

    return (
        <>
            <Menu
                position="bottom-end"
                arrowOffset={16}
                offset={-2}
                zIndex={getDefaultZIndex('max')}
                {...menuProps}
            >
                <Menu.Target>
                    <Button
                        aria-label="Warehouse credentials"
                        variant="default"
                        size="xs"
                    >
                        <MantineIcon
                            icon={IconDatabaseCog}
                            color="light-dark(var(--mantine-color-blue-6), var(--mantine-color-blue-4))"
                        />
                    </Button>
                </Menu.Target>

                <Menu.Dropdown>
                    {(compatibleCredentials || []).map((item) => (
                        <Menu.Item
                            key={item.uuid}
                            leftSection={<MantineIcon icon={IconDatabaseCog} />}
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
                        leftSection={<MantineIcon icon={IconPlus} />}
                        onClick={() => {
                            setIsExpiredSignIn(false);
                            setIsCreatingCredentials(true);
                        }}
                    >
                        Create new
                    </Menu.Item>
                </Menu.Dropdown>
            </Menu>
            {isCreatingCredentials && (
                <AppColorSchemeScope>
                    <CreateCredentialsModal
                        opened={isCreatingCredentials}
                        expiredSignIn={isExpiredSignIn}
                        title={
                            showCreateModalOnPageLoad
                                ? `Login to ${getWarehouseLabel(
                                      activeProject.warehouseConnection?.type,
                                  )}`
                                : undefined
                        }
                        description={
                            showCreateModalOnPageLoad ? (
                                <Text>
                                    The admin of your organization "
                                    {user.data?.organizationName}" requires that
                                    you login to{' '}
                                    {getWarehouseLabel(
                                        activeProject.warehouseConnection?.type,
                                    )}{' '}
                                    to continue.
                                </Text>
                            ) : undefined
                        }
                        nameValue={
                            showCreateModalOnPageLoad ? 'Default' : undefined
                        }
                        warehouseType={activeProject.warehouseConnection?.type}
                        projectUuid={activeProjectUuid}
                        projectName={activeProject.name}
                        onSuccess={(data) => {
                            mutate({
                                projectUuid: activeProjectUuid,
                                userWarehouseCredentialsUuid: data.uuid,
                            });
                        }}
                        onClose={() => setIsCreatingCredentials(false)}
                    />
                </AppColorSchemeScope>
            )}
        </>
    );
};

export default UserCredentialsSwitcher;
