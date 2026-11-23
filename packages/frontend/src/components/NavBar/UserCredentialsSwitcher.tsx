import { allowsOptionalUserCredentials } from '@lightdash/common';
import { Button, getDefaultZIndex, Menu, Text } from '@mantine/core';
import { IconCheck, IconDatabaseCog, IconPlus } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router';
import { useActiveProjectUuid } from '../../hooks/useActiveProject';
import { useProject } from '../../hooks/useProject';
import {
    useProjectUserWarehouseCredentialsPreference,
    useProjectUserWarehouseCredentialsPreferenceMutation,
} from '../../hooks/userWarehouseCredentials/useProjectUserWarehouseCredentialsPreference';
import { useProjectUserWarehouseCredentials } from '../../hooks/userWarehouseCredentials/useUserWarehouseCredentials';
import {
    registerWarehouseCredentialsPrompt,
    retryAfterWarehouseCredentialsSaved,
    WAREHOUSE_CREDENTIALS_ERROR,
    type WarehouseCredentialsErrorDetail,
} from '../../hooks/userWarehouseCredentials/warehouseCredentialsError';
import useApp from '../../providers/App/useApp';
import MantineIcon from '../common/MantineIcon';
import { getWarehouseLabel } from '../ProjectConnection/ProjectConnectFlow/utils';
import { CreateCredentialsModal } from '../UserSettings/MyWarehouseConnectionsPanel/CreateCredentialsModal';
import AppColorSchemeScope from './AppColorSchemeScope';
import { useNavBarMenuProps } from './NavBarPortalContext';
import {
    isRouteThatNeedsWarehouseCredentials,
    isRouteThatPromptsForWarehouseCredentials,
} from './routesThatNeedWarehouseCredentials';

const UserCredentialsSwitcher = () => {
    const menuProps = useNavBarMenuProps();
    const { user } = useApp();
    const location = useLocation();
    const [showCreateModalOnPageLoad, setShowCreateModalOnPageLoad] =
        useState(false);
    const needsWarehouseCredentials =
        isRouteThatNeedsWarehouseCredentials(location);
    const promptsForWarehouseCredentials =
        isRouteThatPromptsForWarehouseCredentials(location);
    const [isCreatingCredentials, setIsCreatingCredentials] = useState(false);
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
    const { mutate } = useProjectUserWarehouseCredentialsPreferenceMutation({
        onSuccess: (_data, { projectUuid }) => {
            if (needsWarehouseCredentials) {
                // reload page because we can't invalidate the results mutation
                window.location.reload();
            } else {
                retryAfterWarehouseCredentialsSaved(queryClient, projectUuid);
            }
        },
    });

    const compatibleCredentials = useMemo(() => {
        return userWarehouseCredentials?.filter(
            ({ credentials }) =>
                credentials.type === activeProject?.warehouseConnection?.type,
        );
    }, [userWarehouseCredentials, activeProject]);

    const requiresUserCredentials =
        !!activeProject?.warehouseConnection?.requireUserCredentials;
    const allowsOptionalCredentials = allowsOptionalUserCredentials(
        activeProject?.warehouseConnection,
    );

    const handleCredentialsError = useCallback(
        (error: WarehouseCredentialsErrorDetail['error'] | undefined) => {
            const warehouseType = activeProject?.warehouseConnection?.type;
            const openModal = () => {
                setShowCreateModalOnPageLoad(true);
                setIsCreatingCredentials(true);
            };
            switch (error?.name) {
                case 'MissingWarehouseCredentialsError':
                    if (requiresUserCredentials) openModal();
                    break;
                case 'SnowflakeTokenError':
                    if (
                        warehouseType === 'snowflake' &&
                        (requiresUserCredentials ||
                            (allowsOptionalCredentials &&
                                error.data?.requiresUserReauthentication ===
                                    true))
                    ) {
                        openModal();
                    }
                    break;
                case 'DatabricksTokenError':
                    if (
                        warehouseType === 'databricks' &&
                        requiresUserCredentials
                    )
                        openModal();
                    break;
                case 'BigqueryTokenError':
                    if (warehouseType === 'bigquery' && requiresUserCredentials)
                        openModal();
                    break;
                case 'RedshiftIamTokenError':
                    if (warehouseType === 'redshift' && requiresUserCredentials)
                        openModal();
                    break;
                default:
            }
        },
        [
            activeProject?.warehouseConnection?.type,
            requiresUserCredentials,
            allowsOptionalCredentials,
        ],
    );

    // Re-open the credentials modal whenever a query fails on credentials
    useEffect(() => {
        const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
            // Only a fresh failure: an errored query also emits updates when
            // it is invalidated or refetched after credentials are saved
            if (event.type === 'updated' && event.action.type === 'error') {
                handleCredentialsError((event.action.error as any)?.error);
            }
        });

        return unsubscribe;
    }, [queryClient, handleCredentialsError]);

    // Same for requests that bypass the query cache (data apps)
    useEffect(() => {
        const listener = (event: Event) => {
            const { detail } =
                event as CustomEvent<WarehouseCredentialsErrorDetail>;
            if (detail.projectUuid !== activeProjectUuid) return;
            handleCredentialsError(detail.error);
        };
        window.addEventListener(WAREHOUSE_CREDENTIALS_ERROR, listener);
        const unregister = registerWarehouseCredentialsPrompt();
        return () => {
            window.removeEventListener(WAREHOUSE_CREDENTIALS_ERROR, listener);
            unregister();
        };
    }, [activeProjectUuid, handleCredentialsError]);

    // Page content that autofocuses on load (the home Ask AI box) would take
    // focus from the modal, leaving Escape and Tab behind it
    useEffect(() => {
        if (!isCreatingCredentials) return;
        const keepFocusInModal = (event: FocusEvent) => {
            if ((event.target as Element | null)?.closest('[data-portal]'))
                return;
            document
                .querySelector<HTMLElement>(
                    '[role="dialog"][aria-modal="true"]',
                )
                ?.focus();
        };
        document.addEventListener('focusin', keepFocusInModal);
        return () => document.removeEventListener('focusin', keepFocusInModal);
    }, [isCreatingCredentials]);

    useEffect(() => {
        // reset state when page changes
        setShowCreateModalOnPageLoad(false);
    }, [location.pathname]);

    useEffect(() => {
        // open create modal on page load if there are no compatible credentials
        if (
            promptsForWarehouseCredentials &&
            !showCreateModalOnPageLoad &&
            activeProject?.warehouseConnection?.requireUserCredentials &&
            !!compatibleCredentials &&
            compatibleCredentials.length === 0
        ) {
            setShowCreateModalOnPageLoad(true);
            setIsCreatingCredentials(true);
        }
    }, [
        promptsForWarehouseCredentials,
        showCreateModalOnPageLoad,
        activeProject,
        compatibleCredentials,
    ]);

    // Show the switcher when personal credentials are mandatory, or when they
    // are optional for this warehouse type and the user already has some
    const isSwitcherVisible =
        requiresUserCredentials ||
        (allowsOptionalCredentials && !!compatibleCredentials?.length);

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

    // Nothing to switch between yet, so offer the setup itself
    const needsSetup =
        requiresUserCredentials && compatibleCredentials?.length === 0;

    return (
        <>
            {needsSetup ? (
                <Button
                    variant="default"
                    size="xs"
                    leftSection={
                        <MantineIcon
                            icon={IconDatabaseCog}
                            color="light-dark(var(--mantine-color-blue-6), var(--mantine-color-blue-4))"
                        />
                    }
                    onClick={() => {
                        setShowCreateModalOnPageLoad(true);
                        setIsCreatingCredentials(true);
                    }}
                >
                    Connect{' '}
                    {getWarehouseLabel(activeProject.warehouseConnection?.type)}
                </Button>
            ) : (
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
                                leftSection={
                                    <MantineIcon icon={IconDatabaseCog} />
                                }
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
                                setIsCreatingCredentials(true);
                            }}
                        >
                            Create new
                        </Menu.Item>
                    </Menu.Dropdown>
                </Menu>
            )}
            {isCreatingCredentials && (
                <AppColorSchemeScope>
                    <CreateCredentialsModal
                        opened={isCreatingCredentials}
                        title={
                            showCreateModalOnPageLoad
                                ? `Login to ${getWarehouseLabel(
                                      activeProject.warehouseConnection?.type,
                                  )}`
                                : undefined
                        }
                        description={
                            !showCreateModalOnPageLoad ? undefined : !requiresUserCredentials ? (
                                <Text>
                                    Your Snowflake sign-in has expired. Sign in
                                    again to continue.
                                </Text>
                            ) : (
                                <Text>
                                    The admin of your organization "
                                    {user.data?.organizationName}" requires that
                                    you login to{' '}
                                    {getWarehouseLabel(
                                        activeProject.warehouseConnection?.type,
                                    )}{' '}
                                    to continue.
                                </Text>
                            )
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
                        onClose={() => {
                            setIsCreatingCredentials(false);
                            // "Create new" must not reopen as the expired sign-in prompt
                            if (!requiresUserCredentials) {
                                setShowCreateModalOnPageLoad(false);
                            }
                        }}
                    />
                </AppColorSchemeScope>
            )}
        </>
    );
};

export default UserCredentialsSwitcher;
