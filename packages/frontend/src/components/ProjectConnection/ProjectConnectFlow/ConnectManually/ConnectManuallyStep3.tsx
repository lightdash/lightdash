import { FC } from 'react';
import { SelectedWarehouse } from '.';
import { CreateProjectConnection } from '../..';
import {
    BackButton,
    CreateHeaderWrapper,
    CreateProjectWrapper,
} from '../../../../pages/CreateProject.styles';
import { Title } from '../ProjectConnectFlow.styles';

interface ConnectManuallyStep3Props {
    needsProject: boolean;
    selectedWarehouse: SelectedWarehouse;
    onBack: () => void;
}

const ConnectManuallyStep3: FC<ConnectManuallyStep3Props> = ({
    needsProject,
    selectedWarehouse,
    onBack,
}) => {
    return (
        <CreateProjectWrapper>
            <CreateHeaderWrapper>
                <BackButton icon="chevron-left" text="Back" onClick={onBack} />

                <Title>
                    {`Create a ${selectedWarehouse.label} connection`}
                </Title>
            </CreateHeaderWrapper>

            <CreateProjectConnection
                needsProject={needsProject}
                selectedWarehouse={selectedWarehouse}
            />
        </CreateProjectWrapper>
    );
};

export default ConnectManuallyStep3;
