import { type WarehouseTypes } from '@lightdash/common';
import { useState, type FC } from 'react';
import ConnectManuallyStep1 from './ConnectManuallyStep1';
import ConnectManuallyStep2 from './ConnectManuallyStep2';

interface ConnectManuallyProps {
    isCreatingFirstProject: boolean;
    selectedWarehouse: WarehouseTypes;
    onBack: () => void;
}

const ConnectManually: FC<ConnectManuallyProps> = ({
    isCreatingFirstProject,
    selectedWarehouse,
    onBack,
}) => {
    const [hasDimensions, setHasDimensions] = useState<boolean>();

    return !hasDimensions ? (
        <ConnectManuallyStep1
            isCreatingFirstProject={isCreatingFirstProject}
            onBack={onBack}
            onForward={() => {
                setHasDimensions(true);
            }}
        />
    ) : (
        <ConnectManuallyStep2
            isCreatingFirstProject={isCreatingFirstProject}
            selectedWarehouse={selectedWarehouse}
            onBack={() => {
                setHasDimensions(false);
            }}
        />
    );
};

export default ConnectManually;
