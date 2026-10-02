import { Flex, Text, Title } from '@mantine/core';
import { type FC } from 'react';
import useApp from '../../providers/App/useApp';
import { SettingsGridCard } from '../common/Settings/SettingsCard';
import DocumentationHelpButton from '../DocumentationHelpButton';
import { useFormContext } from './formContext';
import { getWarehouseIcon } from './ProjectConnectFlow/utils';
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
    const warehouse = form.values.warehouse.type;
    const staticIp = health.data?.staticIp;

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

                {staticIp && (
                    <Text c="gray">
                        If you need to add our IP address to your database's
                        allow-list, use <b>{staticIp}</b>
                    </Text>
                )}
            </div>

            <WarehouseConnectionInputReview>
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
            </WarehouseConnectionInputReview>
        </SettingsGridCard>
    );
};
