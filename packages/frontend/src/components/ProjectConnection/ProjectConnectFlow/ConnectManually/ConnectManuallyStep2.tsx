import { WarehouseTypes } from '@lightdash/common';
import { FC } from 'react';
import { CreateProjectConnection } from '../..';
import {
    BackButton,
    CreateHeaderWrapper,
    CreateProjectWrapper,
} from '../../../../pages/CreateProject.styles';
import { Title } from '../ProjectConnectFlow.styles';
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
        <CreateProjectWrapper>
            <CreateHeaderWrapper>
                <BackButton icon="chevron-left" text="Back" onClick={onBack} />

                <Title>
                    Create a {getWarehouseLabel(selectedWarehouse).label}{' '}
                    connection
                </Title>
            </CreateHeaderWrapper>

            <CreateProjectConnection
                isCreatingFirstProject={isCreatingFirstProject}
                selectedWarehouse={selectedWarehouse}
            />
        </CreateProjectWrapper>
    );
};

export default ConnectManuallyStep2;
