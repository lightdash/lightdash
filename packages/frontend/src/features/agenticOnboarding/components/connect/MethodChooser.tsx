import { type WarehouseTypes } from '@lightdash/common';
import { Anchor, Badge, Stack, Title } from '@mantine-8/core';
import { IconArrowLeft } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../../components/common/MantineIcon';
import OnboardingButton from '../../../../components/ProjectConnection/ProjectConnectFlow/common/OnboardingButton';
import { getWarehouseLabel } from '../../../../components/ProjectConnection/ProjectConnectFlow/utils';
import { useOnboardingWizard } from '../../context/wizardContext';
import { getMethodsForWarehouse } from '../../utils/methodRegistry';
import DemoHatch from '../DemoHatch';

type MethodChooserProps = {
    warehouse: WarehouseTypes;
};

const MethodChooser: FC<MethodChooserProps> = ({ warehouse }) => {
    const { selectMethod, clearWarehouse } = useOnboardingWizard();
    const methods = getMethodsForWarehouse(warehouse);

    return (
        <Stack gap="lg">
            <Anchor
                size="sm"
                onClick={() => clearWarehouse()}
                style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                }}
            >
                <MantineIcon icon={IconArrowLeft} size="sm" />
                Choose a different warehouse
            </Anchor>

            <Title order={3} tabIndex={-1} data-onboarding-heading>
                How do you want to connect {getWarehouseLabel(warehouse)}?
            </Title>

            <Stack gap="sm">
                {methods.map((method) => (
                    <OnboardingButton
                        key={method.id}
                        onClick={() => selectMethod(method.id)}
                        rightIcon={
                            method.recommended ? (
                                <Badge size="sm" variant="light">
                                    Recommended
                                </Badge>
                            ) : undefined
                        }
                        description={method.description}
                    >
                        {method.label}
                    </OnboardingButton>
                ))}
            </Stack>

            <DemoHatch />
        </Stack>
    );
};

export default MethodChooser;
