import { WarehouseTypes } from '@lightdash/common';
import { Badge, Group, SimpleGrid, Stack, Text, Title } from '@mantine-8/core';
import { type FC } from 'react';
import OnboardingButton from '../../../../components/ProjectConnection/ProjectConnectFlow/common/OnboardingButton';
import {
    getWarehouseIcon,
    WarehouseTypeLabels,
} from '../../../../components/ProjectConnection/ProjectConnectFlow/utils';
import { useOnboardingWizard } from '../../context/wizardContext';
import DemoHatch from '../DemoHatch';

const GUIDED_WAREHOUSES = new Set<WarehouseTypes>([WarehouseTypes.SNOWFLAKE]);

const WarehousePicker: FC = () => {
    const { selectWarehouse } = useOnboardingWizard();

    const warehouses = WarehouseTypeLabels.filter(
        (item): item is Extract<typeof item, { iconType: 'image' }> =>
            item.iconType === 'image',
    );

    return (
        <Stack gap="lg">
            <Title order={3} tabIndex={-1} data-onboarding-heading>
                Connect your warehouse
            </Title>
            <Text c="dimmed" size="sm">
                Snowflake is fully guided end-to-end. Every other warehouse
                connects the same way.
            </Text>

            <SimpleGrid cols={2} spacing="sm">
                {warehouses.map((item) => (
                    <OnboardingButton
                        key={item.key}
                        leftIcon={getWarehouseIcon(item.key)}
                        rightIcon={
                            GUIDED_WAREHOUSES.has(item.key) ? (
                                <Badge size="sm" variant="light" color="green">
                                    Guided
                                </Badge>
                            ) : undefined
                        }
                        onClick={() => selectWarehouse(item.key)}
                    >
                        {item.label}
                    </OnboardingButton>
                ))}
            </SimpleGrid>

            <Group justify="center">
                <DemoHatch />
            </Group>
        </Stack>
    );
};

export default WarehousePicker;
