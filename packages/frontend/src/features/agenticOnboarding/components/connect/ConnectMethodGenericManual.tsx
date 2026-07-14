import { type FC } from 'react';
import WarehouseSettingsForm from '../../../../components/ProjectConnection/WarehouseSettingsForm';
import ConnectionTestFlow from './ConnectionTestFlow';
import MethodScreenLayout from './MethodScreenLayout';

const ConnectMethodGenericManual: FC = () => (
    <MethodScreenLayout title="Connect your warehouse">
        <ConnectionTestFlow>
            {(busy) => <WarehouseSettingsForm disabled={busy} />}
        </ConnectionTestFlow>
    </MethodScreenLayout>
);

export default ConnectMethodGenericManual;
