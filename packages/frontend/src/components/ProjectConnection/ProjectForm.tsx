import {
    ProjectType,
    DbtProjectType,
    type DbtProjectConfig,
    type Project,
} from '@lightdash/common';
import { TextInput, Flex, Stack, Text, Title, Avatar } from '@mantine/core';
import { type FC } from 'react';
import { useProjectConnectionLayout } from '../../hooks/useConnections';
import useApp from '../../providers/App/useApp';
import LightdashLogo from '../../svgs/logo-icon.svg';
import { SettingsGridCard } from '../common/Settings/SettingsCard';
import DocumentationHelpButton from '../DocumentationHelpButton';
import ConnectionsPanel from './ConnectionsPanel';
import DbtSettingsForm from './DbtSettingsForm';
import DbtSourcesPanel from './DbtSourcesPanel';
import { useFormContext } from './formContext';
import DbtLogo from './ProjectConnectFlow/Assets/dbt.svg';
import { getWarehouseIcon } from './ProjectConnectFlow/utils';
import { useProjectFormContext } from './useProjectFormContext';
import WarehouseSchemaInput from './WarehouseSchemaInput';
import WarehouseSettingsForm from './WarehouseSettingsForm';

interface Props {
    showGeneralSettings: boolean;
    disabled: boolean;
    defaultType?: DbtProjectType;
    isProjectUpdate?: boolean;
    warehouseOnly?: boolean;
}

const shouldShowConnectionsPanel = (
    savedProject: Project | undefined,
    warehouseOnly: boolean,
    isConnectionsPanelUsed: boolean,
) =>
    savedProject !== undefined &&
    savedProject.type !== ProjectType.PREVIEW &&
    !warehouseOnly &&
    isConnectionsPanelUsed;

const isNativeSemanticLayer = (dbt: DbtProjectConfig) =>
    (dbt.type === DbtProjectType.GITHUB ||
        dbt.type === DbtProjectType.BITBUCKET) &&
    dbt.semanticLayer === 'lightdash';

const WarehouseConnectionCard: FC<{
    disabled: boolean;
    isProjectUpdate?: boolean;
    warehouseOnly: boolean;
    showSchemaInput: boolean;
}> = ({ disabled, isProjectUpdate, warehouseOnly, showSchemaInput }) => {
    const { health } = useApp();
    const form = useFormContext();
    const warehouse = form.values.warehouse.type;

    return (
        <SettingsGridCard p={warehouseOnly ? 'xl' : 'md'}>
            <div>
                {warehouse && getWarehouseIcon(warehouse)}
                <Flex align="center" gap={2}>
                    <Title order={5}>Warehouse connection</Title>
                    <DocumentationHelpButton
                        href="https://docs.lightdash.com/get-started/setup-lightdash/connect-project#warehouse-connection"
                        pos="relative"
                        top="2px"
                    />
                </Flex>

                {health.data?.staticIp && (
                    <Text c="gray">
                        If you need to add our IP address to your database's
                        allow-list, use <b>{health.data?.staticIp}</b>
                    </Text>
                )}
            </div>

            <div>
                <WarehouseSettingsForm
                    disabled={disabled}
                    isProjectUpdate={isProjectUpdate}
                >
                    {showSchemaInput &&
                        warehouse &&
                        !form.values.organizationWarehouseCredentialsUuid && (
                            <WarehouseSchemaInput
                                warehouseType={warehouse}
                                disabled={disabled}
                                warehouseOnly
                            />
                        )}
                </WarehouseSettingsForm>
            </div>
        </SettingsGridCard>
    );
};

export const ProjectForm: FC<Props> = ({
    showGeneralSettings,
    disabled,
    defaultType,
    isProjectUpdate,
    warehouseOnly = false,
}) => {
    const form = useFormContext();
    const { savedProject } = useProjectFormContext();
    const { isConnectionsPanelUsed } = useProjectConnectionLayout(
        savedProject?.projectUuid,
    );
    const showConnectionsPanel = shouldShowConnectionsPanel(
        savedProject,
        warehouseOnly,
        isConnectionsPanelUsed,
    );
    const isNative = isNativeSemanticLayer(form.values.dbt);

    return (
        <Stack gap="xl">
            {showGeneralSettings && (
                <SettingsGridCard>
                    <div>
                        <Title order={5}>General settings</Title>
                    </div>

                    <div>
                        <TextInput
                            name="name"
                            label="Project name"
                            required
                            disabled={disabled}
                            {...form.getInputProps('name')}
                        />
                    </div>
                </SettingsGridCard>
            )}

            {!showConnectionsPanel && (
                <WarehouseConnectionCard
                    disabled={disabled}
                    isProjectUpdate={isProjectUpdate}
                    warehouseOnly={warehouseOnly}
                    showSchemaInput={warehouseOnly || isNative}
                />
            )}

            {showConnectionsPanel && savedProject && (
                <ConnectionsPanel projectUuid={savedProject.projectUuid} />
            )}

            {!warehouseOnly && (
                <SettingsGridCard>
                    <div>
                        <Avatar
                            size="md"
                            src={isNative ? LightdashLogo : DbtLogo}
                            alt={isNative ? 'Lightdash icon' : 'dbt icon'}
                        />

                        <Flex align="center" gap={2}>
                            <Title order={5}>Semantic layer connection</Title>
                            <DocumentationHelpButton
                                href="https://docs.lightdash.com/get-started/setup-lightdash/connect-project"
                                pos="relative"
                                top="2px"
                            />
                        </Flex>
                    </div>

                    <div>
                        <DbtSettingsForm
                            disabled={disabled}
                            defaultType={defaultType}
                        />
                    </div>
                </SettingsGridCard>
            )}

            {savedProject &&
                savedProject.type !== ProjectType.PREVIEW &&
                !isNative && (
                    <DbtSourcesPanel projectUuid={savedProject.projectUuid} />
                )}
        </Stack>
    );
};
