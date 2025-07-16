import { type DbtProjectType } from '@lightdash/common';
import { Avatar, Flex, Stack, Text, TextInput, Title } from '@mantine/core';
import { type FC } from 'react';
import useApp from '../../providers/App/useApp';
import DocumentationHelpButton from '../DocumentationHelpButton';
import { SettingsGridCard } from '../common/Settings/SettingsCard';
import DbtSettingsForm from './DbtSettingsForm';
import DbtLogo from './ProjectConnectFlow/Assets/dbt.svg';
import { getWarehouseIcon } from './ProjectConnectFlow/utils';
import WarehouseSettingsForm from './WarehouseSettingsForm';
import { useFormContext } from './formContext';

interface Props {
    showGeneralSettings: boolean;
    disabled: boolean;
    defaultType?: DbtProjectType;
    isProjectUpdate?: boolean;
}

export const ProjectForm: FC<Props> = ({
    showGeneralSettings,
    disabled,
    defaultType,
    isProjectUpdate,
}) => {
    const { health } = useApp();
    const form = useFormContext();
    const warehouse = form.values.warehouse.type;

    return (
        <Stack spacing="xl">
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

            <SettingsGridCard>
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
                        <Text color="gray">
                            If you need to add our IP address to your database's
                            allow-list, use <b>{health.data?.staticIp}</b>
                        </Text>
                    )}
                </div>

                <div>
                    <WarehouseSettingsForm
                        disabled={disabled}
                        isProjectUpdate={isProjectUpdate}
                    />
                </div>
            </SettingsGridCard>

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
        </Stack>
    );
};
