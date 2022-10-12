import { FC, useState } from 'react';
import { useHistory } from 'react-router-dom';
import { SelectedWarehouse } from '../SelectWarehouse';
import ConnectManuallyStep1 from './ConnectManuallyStep1';
import ConnectManuallyStep2 from './ConnectManuallyStep2';

interface ConnectManuallyProps {
    isCreatingFirstProject: boolean;
    selectedWarehouse: SelectedWarehouse;
}

const ConnectManually: FC<ConnectManuallyProps> = ({
    isCreatingFirstProject,
    selectedWarehouse,
}) => {
    const history = useHistory();

    const [hasDimensions, setHasDimensions] = useState<boolean>();

    return (
        <>
            {!hasDimensions && (
                <ConnectManuallyStep1
                    isCreatingFirstProject={isCreatingFirstProject}
                    onBack={() => {
                        history.goBack();
                    }}
                    onForward={() => {
                        setHasDimensions(true);
                    }}
                />
            )}

            {hasDimensions && (
                <ConnectManuallyStep2
                    isCreatingFirstProject={isCreatingFirstProject}
                    selectedWarehouse={selectedWarehouse}
                    onBack={() => {
                        setHasDimensions(false);
                    }}
                />
            )}
        </>
    );
};

export default ConnectManually;
