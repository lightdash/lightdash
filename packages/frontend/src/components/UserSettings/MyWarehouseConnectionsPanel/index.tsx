import {
    FeatureFlags,
    UserWarehouseCredentialPurpose,
    type UserWarehouseCredentials,
} from '@lightdash/common';
import { Anchor, Button, Text } from '@mantine/core';
import { IconDatabaseCog, IconPlus } from '@tabler/icons-react';
import { useState } from 'react';
import useHealth from '../../../hooks/health/useHealth';
import { useUserWarehouseCredentials } from '../../../hooks/userWarehouseCredentials/useUserWarehouseCredentials';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import MantineIcon from '../../common/MantineIcon';
import { SettingsEmptyState } from '../../common/Settings/SettingsEmptyState';
import { SettingsPage } from '../../common/Settings/SettingsPage';
import { AiIdentitySection } from './AiIdentitySection';
import { CreateCredentialsModal } from './CreateCredentialsModal';
import { CredentialsTable } from './CredentialsTable';
import { DeleteCredentialsModal } from './DeleteCredentialsModal';
import { EditCredentialsModal } from './EditCredentialsModal';
import { SnowflakeAiSignInSection } from './SnowflakeAiSignInSection';
import { shouldShowSnowflakeAiSignIn } from './snowflakeAiVisibility';

export const MyWarehouseConnectionsPanel = () => {
    const { data: credentials } = useUserWarehouseCredentials();
    const { data: health } = useHealth();
    const { data: aiSignInFlag } = useServerFeatureFlag(
        FeatureFlags.SnowflakeAiSignIn,
    );
    const { data: aiIdentitiesFlag } = useServerFeatureFlag(
        FeatureFlags.SnowflakeAiTwins,
    );
    const defaultCredentials = credentials?.filter(
        ({ purpose }) => purpose !== UserWarehouseCredentialPurpose.AI,
    );
    const showAiSignIn = shouldShowSnowflakeAiSignIn(
        aiSignInFlag?.enabled === true,
        health?.auth.snowflakeAi.enabled === true,
    );
    const [isCreatingCredentials, setIsCreatingCredentials] = useState(false);
    const [warehouseCredentialsToBeEdited, setWarehouseCredentialsToBeEdited] =
        useState<UserWarehouseCredentials | undefined>(undefined);
    const [
        warehouseCredentialsToBeDeleted,
        setWarehouseCredentialsToBeDeleted,
    ] = useState<UserWarehouseCredentials | undefined>(undefined);

    const personalConnectionsCallout = (
        <Text c="dimmed" fz="xs">
            These credentials are only used for projects that require user
            credentials -{' '}
            <Anchor
                role="button"
                href="https://docs.lightdash.com/references/personal-warehouse-connections"
                target="_blank"
                rel="noreferrer"
                fz="xs"
            >
                learn more
            </Anchor>
            .
        </Text>
    );

    return (
        <SettingsPage
            title="My warehouse connections"
            description="Manage the personal credentials used to connect Lightdash to warehouses."
            actions={
                <Button
                    size="xs"
                    leftSection={<MantineIcon icon={IconPlus} />}
                    onClick={() => setIsCreatingCredentials(true)}
                >
                    Add credentials
                </Button>
            }
        >
            {aiIdentitiesFlag?.enabled ? (
                <AiIdentitySection />
            ) : (
                showAiSignIn && (
                    <SnowflakeAiSignInSection credentials={credentials ?? []} />
                )
            )}
            {defaultCredentials && defaultCredentials.length > 0 ? (
                <>
                    {personalConnectionsCallout}
                    <CredentialsTable
                        credentials={defaultCredentials}
                        setWarehouseCredentialsToBeDeleted={
                            setWarehouseCredentialsToBeDeleted
                        }
                        setWarehouseCredentialsToBeEdited={
                            setWarehouseCredentialsToBeEdited
                        }
                    />
                </>
            ) : (
                <SettingsEmptyState
                    icon={IconDatabaseCog}
                    title="No warehouse connections"
                    description="Add personal credentials for projects that require them."
                >
                    {personalConnectionsCallout}
                </SettingsEmptyState>
            )}

            {!!warehouseCredentialsToBeEdited && (
                <EditCredentialsModal
                    opened={!!warehouseCredentialsToBeEdited}
                    onClose={() => setWarehouseCredentialsToBeEdited(undefined)}
                    userCredentials={warehouseCredentialsToBeEdited}
                />
            )}

            {isCreatingCredentials && (
                <CreateCredentialsModal
                    opened={isCreatingCredentials}
                    onClose={() => setIsCreatingCredentials(false)}
                />
            )}

            {warehouseCredentialsToBeDeleted && (
                <DeleteCredentialsModal
                    opened={!!warehouseCredentialsToBeDeleted}
                    onClose={() =>
                        setWarehouseCredentialsToBeDeleted(undefined)
                    }
                    warehouseCredentialsToBeDeleted={
                        warehouseCredentialsToBeDeleted
                    }
                />
            )}
        </SettingsPage>
    );
};
