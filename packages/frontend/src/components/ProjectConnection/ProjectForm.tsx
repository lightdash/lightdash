import { ProjectType, type DbtProjectType } from '@lightdash/common';
import { TextInput, Flex, Stack, Text, Title, Avatar } from '@mantine-8/core';
import { type FC } from 'react';
import useApp from '../../providers/App/useApp';
import { SettingsGridCard } from '../common/Settings/SettingsCard';
import DocumentationHelpButton from '../DocumentationHelpButton';
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
    const { health } = useApp();
    const form = useFormContext();
    const { savedProject } = useProjectFormContext();
    const warehouse = form.values.warehouse.type;

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
                        {warehouseOnly &&
                            warehouse &&
                            !form.values
                                .organizationWarehouseCredentialsUuid && (
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
                        <Avatar size="md" src={DbtLogo} alt="dbt icon" />

                        <Flex align="center" gap={2}>
                            <Title order={5}>dbt connection</Title>
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

            {savedProject && savedProject.type !== ProjectType.PREVIEW && (
                <DbtSourcesPanel projectUuid={savedProject.projectUuid} />
            )}
        </Stack>
    );
};
