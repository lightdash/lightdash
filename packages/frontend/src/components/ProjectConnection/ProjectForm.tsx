import { ProjectType, DbtProjectType, WarehouseTypes } from '@lightdash/common';
import { TextInput, Flex, Stack, Title, Avatar, Box } from '@mantine/core';
import { type FC } from 'react';
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

// These warehouses only read the schema when running dbt
const DBT_ONLY_SCHEMA_WAREHOUSES = new Set<WarehouseTypes>([
    WarehouseTypes.POSTGRES,
    WarehouseTypes.REDSHIFT,
    WarehouseTypes.BIGQUERY,
]);

interface Props {
    showGeneralSettings: boolean;
    disabled: boolean;
    defaultType?: DbtProjectType;
    isProjectUpdate?: boolean;
    warehouseOnly?: boolean;
    dbtTypePicker?: 'select' | 'tiles';
}

export const ProjectForm: FC<Props> = ({
    showGeneralSettings,
    disabled,
    defaultType,
    isProjectUpdate,
    warehouseOnly = false,
    dbtTypePicker = 'select',
}) => {
    const form = useFormContext();
    const { savedProject } = useProjectFormContext();
    const warehouse = form.values.warehouse.type;
    const isNative =
        (form.values.dbt.type === DbtProjectType.GITHUB ||
            form.values.dbt.type === DbtProjectType.BITBUCKET) &&
        form.values.dbt.semanticLayer === 'lightdash';

    return (
        <Stack gap="xl">
            {showGeneralSettings && (
                <SettingsGridCard data-connection-card>
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

            <SettingsGridCard
                p={warehouseOnly ? 'xl' : 'md'}
                data-connection-card
            >
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
                </div>

                <div>
                    <ConnectionsPanel savedProject={savedProject} />
                    <WarehouseSettingsForm
                        allowMixedWarehouseTypes={false}
                        disabled={disabled}
                        isProjectUpdate={isProjectUpdate}
                    >
                        {(warehouseOnly || isNative) && warehouse && (
                            <Box
                                data-dbt-only-schema={DBT_ONLY_SCHEMA_WAREHOUSES.has(
                                    warehouse,
                                )}
                            >
                                <WarehouseSchemaInput
                                    warehouseType={warehouse}
                                    disabled={disabled}
                                    warehouseOnly
                                />
                            </Box>
                        )}
                    </WarehouseSettingsForm>
                </div>
            </SettingsGridCard>

            {!warehouseOnly && (
                <SettingsGridCard data-connection-card="dbt">
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
                            typePicker={dbtTypePicker}
                        />
                    </div>
                </SettingsGridCard>
            )}

            {savedProject &&
                savedProject.type !== ProjectType.PREVIEW &&
                !isNative && <DbtSourcesPanel project={savedProject} />}
        </Stack>
    );
};
