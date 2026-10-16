import { type WarehouseTypes } from '@lightdash/common';
import { Button, Stack } from '@mantine/core';
import { IconChevronLeft } from '@tabler/icons-react';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { CreateProjectConnection } from '../..';
import MantineIcon from '../../../common/MantineIcon';
import { OnboardingTitle } from '../common/OnboardingTitle';
import { getWarehouseLabel } from '../utils';

interface ConnectManuallyStep2Props {
    isCreatingFirstProject: boolean;
    selectedWarehouse: WarehouseTypes;
    warehouseOnly?: boolean;
    onBack: () => void;
    successRedirect?: (projectUuid: string) => string;
    celebrateOnSuccess?: boolean;
}

const ConnectManuallyStep2: FC<ConnectManuallyStep2Props> = ({
    isCreatingFirstProject,
    selectedWarehouse,
    warehouseOnly = false,
    onBack,
    successRedirect,
    celebrateOnSuccess = false,
}) => {
    const { t } = useTranslation('projectConnection');
    return (
        <>
            <Stack align="flex-start">
                <Button
                    variant="subtle"
                    size="sm"
                    leftSection={<MantineIcon icon={IconChevronLeft} />}
                    onClick={onBack}
                >
                    {t('actions.back', { ns: 'common' })}
                </Button>

                <OnboardingTitle>
                    {t('connectFlow.manual.createConnection', {
                        warehouse: getWarehouseLabel(selectedWarehouse),
                    })}
                </OnboardingTitle>

                <CreateProjectConnection
                    isCreatingFirstProject={isCreatingFirstProject}
                    selectedWarehouse={selectedWarehouse}
                    warehouseOnly={warehouseOnly}
                    successRedirect={successRedirect}
                    celebrateOnSuccess={celebrateOnSuccess}
                />
            </Stack>
        </>
    );
};

export default ConnectManuallyStep2;
