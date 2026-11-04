import { ProjectType, DbtProjectType } from '@lightdash/common';
import { TextInput, Flex, Stack, Title, Avatar } from '@mantine/core';
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

interface Props {
    showGeneralSettings: boolean;
    disabled: boolean;
    defaultType?: DbtProjectType;
    isProjectUpdate?: boolean;
    warehouseOnly?: boolean;
}

export const ProjectForm: FC<Props> = ({
    showGeneralSettings,
    disabled,
    defaultType,
    isProjectUpdate,
    warehouseOnly = false,
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
                </div>

                <div>
                    <WarehouseSettingsForm
                        allowMixedWarehouseTypes={false}
                        disabled={disabled}
                        isProjectUpdate={isProjectUpdate}
                    >
                        {(warehouseOnly || isNative) && warehouse && (
                            <WarehouseSchemaInput
                                warehouseType={warehouse}
                                disabled={disabled}
                                warehouseOnly
                            />
                        )}
                    </WarehouseSettingsForm>
                </div>
            </SettingsGridCard>

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

            <ConnectionsPanel savedProject={savedProject} />

            {savedProject &&
                savedProject.type !== ProjectType.PREVIEW &&
                !isNative && <DbtSourcesPanel project={savedProject} />}
        </Stack>
    );
};
