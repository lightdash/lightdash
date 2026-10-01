import { FeatureFlags } from '@lightdash/common';
import { Box, Flex, Text, Title } from '@mantine/core';
import { type FC } from 'react';
import { useServerFeatureFlag } from '../../hooks/useServerOrClientFeatureFlag';
import useApp from '../../providers/App/useApp';
import { SettingsGridCard } from '../common/Settings/SettingsCard';
import DocumentationHelpButton from '../DocumentationHelpButton';
import { EgressIpNotice } from './EgressIpNotice';
import { useFormContext } from './formContext';
import { getWarehouseIcon } from './ProjectConnectFlow/utils';
import { SharedSignInNotice } from './SharedSignIn/SharedSignInNotice';
import { useProjectFormContext } from './useProjectFormContext';
import { WarehouseConnectionInputReview } from './WarehouseConnectionInputReview';
import WarehouseSchemaInput from './WarehouseSchemaInput';
import WarehouseSettingsForm from './WarehouseSettingsForm';

type Props = {
    disabled: boolean;
    isProjectUpdate: boolean | undefined;
    warehouseOnly: boolean;
    showSchemaInput: boolean;
};

export const WarehouseConnectionCard: FC<Props> = ({
    disabled,
    isProjectUpdate,
    warehouseOnly,
    showSchemaInput,
}) => {
    const { health } = useApp();
    const form = useFormContext();
    const { savedProject, isProjectExtraConnection } = useProjectFormContext();
    const warehouse = form.values.warehouse.type;
    const staticIp = health.data?.staticIp;
    const connectJourneyFlag = useServerFeatureFlag(
        FeatureFlags.ConnectJourney,
    );
    const isConnectJourneyEnabled = connectJourneyFlag.data?.enabled === true;

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

                {!isConnectJourneyEnabled && staticIp && (
                    <Text c="gray">
                        If you need to add our IP address to your database's
                        allow-list, use <b>{staticIp}</b>
                    </Text>
                )}
            </div>

            <WarehouseConnectionInputReview>
                {isProjectUpdate &&
                    savedProject &&
                    !isProjectExtraConnection &&
                    warehouse && (
                        <SharedSignInNotice
                            projectUuid={savedProject.projectUuid}
                            warehouseType={warehouse}
                            disabled={disabled}
                        />
                    )}
                <WarehouseSettingsForm
                    disabled={disabled}
                    isProjectUpdate={isProjectUpdate}
                >
                    {showSchemaInput && warehouse && (
                        <WarehouseSchemaInput
                            warehouseType={warehouse}
                            disabled={disabled}
                            warehouseOnly
                        />
                    )}
                </WarehouseSettingsForm>
                {isConnectJourneyEnabled && warehouse && (
                    <Box mt="md">
                        <EgressIpNotice warehouseType={warehouse} />
                    </Box>
                )}
            </WarehouseConnectionInputReview>
        </SettingsGridCard>
    );
};
