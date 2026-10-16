import {
    UserWarehouseCredentialPurpose,
    type UserWarehouseCredentials,
} from '@lightdash/common';
import { Anchor, Button, Text } from '@mantine/core';
import { IconDatabaseCog, IconPlus } from '@tabler/icons-react';
import { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { useUserWarehouseCredentials } from '../../../hooks/userWarehouseCredentials/useUserWarehouseCredentials';
import MantineIcon from '../../common/MantineIcon';
import { SettingsEmptyState } from '../../common/Settings/SettingsEmptyState';
import { SettingsPage } from '../../common/Settings/SettingsPage';
import { CreateCredentialsModal } from './CreateCredentialsModal';
import { CredentialsTable } from './CredentialsTable';
import { DeleteCredentialsModal } from './DeleteCredentialsModal';
import { EditCredentialsModal } from './EditCredentialsModal';

export const MyWarehouseConnectionsPanel = () => {
    const { t } = useTranslation('userSettings');
    const { data: credentials } = useUserWarehouseCredentials();
    const defaultCredentials = credentials?.filter(
        ({ purpose }) => purpose !== UserWarehouseCredentialPurpose.AI,
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
            <Trans
                t={t}
                i18nKey="myWarehouseConnectionsPanel.page.callout"
                components={{
                    docsLink: (
                        <Anchor
                            role="button"
                            href="https://docs.lightdash.com/references/personal-warehouse-connections"
                            target="_blank"
                            rel="noreferrer"
                            fz="xs"
                        />
                    ),
                }}
            />
        </Text>
    );

    return (
        <SettingsPage
            title={t('myWarehouseConnectionsPanel.page.title')}
            description={t('myWarehouseConnectionsPanel.page.description')}
            actions={
                <Button
                    size="xs"
                    leftSection={<MantineIcon icon={IconPlus} />}
                    onClick={() => setIsCreatingCredentials(true)}
                >
                    {t('myWarehouseConnectionsPanel.page.addCredentials')}
                </Button>
            }
        >
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
                    title={t(
                        'myWarehouseConnectionsPanel.page.emptyState.title',
                    )}
                    description={t(
                        'myWarehouseConnectionsPanel.page.emptyState.description',
                    )}
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
