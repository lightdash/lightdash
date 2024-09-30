import { type WarehouseTypes } from '@lightdash/common';
import { Button, Stack } from '@mantine/core';
import { IconChevronLeft } from '@tabler/icons-react';
import { type FC } from 'react';
import { CreateProjectConnection } from '../..';
import MantineIcon from '../../../common/MantineIcon';
import { OnboardingTitle } from '../common/OnboardingTitle';
import { getWarehouseLabel } from '../SelectWarehouse';

interface ConnectManuallyStep2Props {
    isCreatingFirstProject: boolean;
    selectedWarehouse: WarehouseTypes;
    onBack: () => void;
}

const ConnectManuallyStep2: FC<ConnectManuallyStep2Props> = ({
    isCreatingFirstProject,
    selectedWarehouse,
    onBack,
}) => {
    return (
        <>
            <Stack align="left">
                <Button
                    variant="subtle"
                    size="sm"
                    leftIcon={<MantineIcon icon={IconChevronLeft} />}
                    onClick={onBack}
                    sx={{ alignSelf: 'flex-start' }}
                >
                    Back
                </Button>

                <OnboardingTitle>
                    Create a {getWarehouseLabel(selectedWarehouse)} connection
                </OnboardingTitle>

                <CreateProjectConnection
                    isCreatingFirstProject={isCreatingFirstProject}
                    selectedWarehouse={selectedWarehouse}
                />
            </Stack>
        </>
    );
};

export default ConnectManuallyStep2;
