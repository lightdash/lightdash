import {
    allowsOptionalUserCredentials,
    type Project,
    type UserWarehouseCredentials,
    type WarehouseTypes,
} from '@lightdash/common';
import { Button, getDefaultZIndex, Menu, Text } from '@mantine/core';
import { IconCheck, IconDatabaseCog, IconPlus } from '@tabler/icons-react';
import { useMemo, useState, type FC } from 'react';
import {
    useProjectUserWarehouseCredentialsPreference,
    useProjectUserWarehouseCredentialsPreferenceMutation,
} from '../../hooks/userWarehouseCredentials/useProjectUserWarehouseCredentialsPreference';
import { useProjectUserWarehouseCredentials } from '../../hooks/userWarehouseCredentials/useUserWarehouseCredentials';
import {
    useWarehouseConnectionList,
    useWarehouseConnectionsUserCredentials,
    useWarehouseConnectionUserCredentialsMutation,
} from '../../hooks/useWarehouseConnections';
import MantineIcon from '../common/MantineIcon';
import { CreateCredentialsModal } from '../UserSettings/MyWarehouseConnectionsPanel/CreateCredentialsModal';
import AppColorSchemeScope from './AppColorSchemeScope';
import { useNavBarMenuProps } from './NavBarPortalContext';

type ConnectionCredentialsSection = {
    key: string;
    name: string;
    warehouseType: WarehouseTypes;
    selectedUuid: string | null;
    onSelect: (userWarehouseCredentialsUuid: string) => void;
};

type Props = {
    project: Project;
    onPreferenceSaved: () => void;
};

const ConnectionCredentialsSwitcher: FC<Props> = ({
    project,
    onPreferenceSaved,
}) => {
    const menuProps = useNavBarMenuProps();
    const [creatingFor, setCreatingFor] =
        useState<ConnectionCredentialsSection | null>(null);
    const { projectUuid } = project;

    const { data: connectionList } = useWarehouseConnectionList(
        projectUuid,
        true,
    );
    const extraConnections = useMemo(
        () =>
            connectionList?.connections.filter(
                (connection) => !connection.isOriginal,
            ) ?? [],
        [connectionList],
    );
    const originalConnection = connectionList?.connections.find(
        (connection) => connection.isOriginal,
    );
    const extraUserCredentials = useWarehouseConnectionsUserCredentials(
        projectUuid,
        extraConnections.map(
            (connection) => connection.warehouseConnectionUuid,
        ),
    );
    const { data: userWarehouseCredentials } =
        useProjectUserWarehouseCredentials(projectUuid);
    const { data: originalPreference } =
        useProjectUserWarehouseCredentialsPreference(projectUuid);
    const { mutate: saveOriginalPreference } =
        useProjectUserWarehouseCredentialsPreferenceMutation({
            onSuccess: onPreferenceSaved,
        });
    const { mutate: saveExtraPreference } =
        useWarehouseConnectionUserCredentialsMutation(projectUuid, {
            onSuccess: onPreferenceSaved,
        });

    const compatibleCredentials = (warehouseType: WarehouseTypes) =>
        (userWarehouseCredentials ?? []).filter(
            ({ credentials }) => credentials.type === warehouseType,
        );

    const isSectionVisible = (
        warehouseType: WarehouseTypes,
        requireUserCredentials: boolean,
        allowsOptional: boolean,
    ) =>
        requireUserCredentials ||
        (allowsOptional && compatibleCredentials(warehouseType).length > 0);

    const sections: ConnectionCredentialsSection[] = [];
    const originalWarehouse = project.warehouseConnection;
    if (
        originalWarehouse &&
        isSectionVisible(
            originalWarehouse.type,
            originalWarehouse.requireUserCredentials === true,
            allowsOptionalUserCredentials(originalWarehouse),
        )
    ) {
        sections.push({
            key: 'original',
            name: originalConnection?.name ?? project.name,
            warehouseType: originalWarehouse.type,
            selectedUuid: originalPreference?.uuid ?? null,
            onSelect: (userWarehouseCredentialsUuid) =>
                saveOriginalPreference({
                    projectUuid,
                    userWarehouseCredentialsUuid,
                }),
        });
    }
    extraConnections.forEach((connection, index) => {
        const userCredentials = extraUserCredentials[index]?.data;
        if (
            userCredentials &&
            isSectionVisible(
                userCredentials.warehouseType,
                userCredentials.requireUserCredentials,
                userCredentials.allowsOptionalUserCredentials,
            )
        ) {
            sections.push({
                key: connection.warehouseConnectionUuid,
                name: connection.name,
                warehouseType: userCredentials.warehouseType,
                selectedUuid:
                    userCredentials.userWarehouseCredentials?.uuid ?? null,
                onSelect: (userWarehouseCredentialsUuid) =>
                    saveExtraPreference({
                        warehouseConnectionUuid:
                            connection.warehouseConnectionUuid,
                        userWarehouseCredentialsUuid,
                    }),
            });
        }
    });

    if (sections.length === 0) {
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
                    {sections.map((section, index) => (
                        <ConnectionCredentialsMenuSection
                            key={section.key}
                            section={section}
                            credentials={compatibleCredentials(
                                section.warehouseType,
                            )}
                            hasDivider={index > 0}
                            onCreate={() => setCreatingFor(section)}
                        />
                    ))}
                </Menu.Dropdown>
            </Menu>
            {creatingFor && (
                <AppColorSchemeScope>
                    <CreateCredentialsModal
                        opened
                        warehouseType={creatingFor.warehouseType}
                        projectUuid={projectUuid}
                        projectName={project.name}
                        onSuccess={(data) => creatingFor.onSelect(data.uuid)}
                        onClose={() => setCreatingFor(null)}
                    />
                </AppColorSchemeScope>
            )}
        </>
    );
};

const ConnectionCredentialsMenuSection: FC<{
    section: ConnectionCredentialsSection;
    credentials: UserWarehouseCredentials[];
    hasDivider: boolean;
    onCreate: () => void;
}> = ({ section, credentials, hasDivider, onCreate }) => (
    <>
        {hasDivider && <Menu.Divider />}
        <Menu.Label>
            <Text fz="xs" fw={600} truncate>
                {section.name}
            </Text>
        </Menu.Label>
        {credentials.map((item) => (
            <Menu.Item
                key={item.uuid}
                leftSection={<MantineIcon icon={IconDatabaseCog} />}
                rightSection={
                    section.selectedUuid === item.uuid ? (
                        <MantineIcon icon={IconCheck} />
                    ) : undefined
                }
                onClick={() => section.onSelect(item.uuid)}
            >
                {item.name}
            </Menu.Item>
        ))}
        <Menu.Item
            leftSection={<MantineIcon icon={IconPlus} />}
            onClick={onCreate}
        >
            Create new
        </Menu.Item>
    </>
);

export default ConnectionCredentialsSwitcher;
