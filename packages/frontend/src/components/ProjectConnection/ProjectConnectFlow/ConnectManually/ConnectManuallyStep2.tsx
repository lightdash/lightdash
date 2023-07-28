import { WarehouseTypes } from '@lightdash/common';
import { Button, Stack, Title } from '@mantine/core';
import { IconChevronLeft } from '@tabler/icons-react';
import { FC } from 'react';
import { CreateProjectConnection } from '../..';
import MantineIcon from '../../../common/MantineIcon';
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

                <Title order={3} fw={500}>
                    Create a {getWarehouseLabel(selectedWarehouse)} connection
                </Title>

                <CreateProjectConnection
                    isCreatingFirstProject={isCreatingFirstProject}
                    selectedWarehouse={selectedWarehouse}
                />
            </Stack>
        </>
    );
};

export default ConnectManuallyStep2;
