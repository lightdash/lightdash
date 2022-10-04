import { WarehouseTypes } from '@lightdash/common';
import { FC, useState } from 'react';
import { useHistory } from 'react-router-dom';
import ConnectManuallyStep1 from './ConnectManuallyStep1';
import ConnectManuallyStep2 from './ConnectManuallyStep2';
import ConnectManuallyStep3 from './ConnectManuallyStep3';

export type SelectedWarehouse = {
    label: string;
    key: WarehouseTypes;
    icon: string;
};

interface ConnectManuallyProps {
    needsProject: boolean;
}

const ConnectManually: FC<ConnectManuallyProps> = ({ needsProject }) => {
    const history = useHistory();

    const [hasDimensions, setHasDimensions] = useState<boolean>();
    const [selectedWarehouse, setSelectedWarehouse] =
        useState<SelectedWarehouse>();

    return (
        <>
            {!hasDimensions && (
                <ConnectManuallyStep1
                    needsProject={needsProject}
                    onBack={() => {
                        history.goBack();
                    }}
                    onForward={() => {
                        setHasDimensions(true);
                    }}
                />
            )}

            {hasDimensions && !selectedWarehouse && (
                <ConnectManuallyStep2
                    needsProject={needsProject}
                    onBack={() => {
                        setHasDimensions(false);
                    }}
                    onSelectWarehouse={(warehouse) => {
                        setSelectedWarehouse(warehouse);
                    }}
                />
            )}

            {hasDimensions && selectedWarehouse && (
                <ConnectManuallyStep3
                    needsProject={needsProject}
                    selectedWarehouse={selectedWarehouse}
                    onBack={() => {
                        setSelectedWarehouse(undefined);
                    }}
                />
            )}
        </>
    );
};

export default ConnectManually;
