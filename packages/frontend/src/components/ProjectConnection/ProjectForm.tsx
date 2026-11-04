import { ProjectType, DbtProjectType } from '@lightdash/common';
import { TextInput, Stack } from '@mantine/core';
import { type FC } from 'react';
import { SettingsSection } from '../common/Settings/SettingLayout';
import { SettingsCard } from '../common/Settings/SettingsCard';
import DocumentationHelpButton from '../DocumentationHelpButton';
import ConnectionsPanel from './ConnectionsPanel';
import DbtSettingsForm from './DbtSettingsForm';
import DbtSourcesPanel from './DbtSourcesPanel';
import { useFormContext } from './formContext';
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
        <Stack gap="lg">
            {showGeneralSettings && (
                <SettingsSection label="General" description={null}>
                    <SettingsCard>
                        <TextInput
                            name="name"
                            label="Project name"
                            required
                            disabled={disabled}
                            {...form.getInputProps('name')}
                        />
                    </SettingsCard>
                </SettingsSection>
            )}

            <SettingsSection
                label="Warehouse connection"
                description="Credentials this project uses to query your data warehouse."
                titleAddon={
                    <DocumentationHelpButton
                        href="https://docs.lightdash.com/get-started/setup-lightdash/connect-project#warehouse-connection"
                        display="flex"
                    />
                }
            >
                <SettingsCard>
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
                </SettingsCard>

                <ConnectionsPanel savedProject={savedProject} />
            </SettingsSection>

            {!warehouseOnly && (
                <SettingsSection
                    label="Semantic layer connection"
                    description="Where this project's models and metrics are loaded from."
                    titleAddon={
                        <DocumentationHelpButton
                            href="https://docs.lightdash.com/get-started/setup-lightdash/connect-project"
                            display="flex"
                        />
                    }
                >
                    <SettingsCard>
                        <DbtSettingsForm
                            disabled={disabled}
                            defaultType={defaultType}
                        />
                    </SettingsCard>
                </SettingsSection>
            )}

            {savedProject &&
                savedProject.type !== ProjectType.PREVIEW &&
                !isNative && <DbtSourcesPanel project={savedProject} />}
        </Stack>
    );
};
