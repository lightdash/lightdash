import { type SnowflakeAuthenticationType } from '@lightdash/common';
import { useEffect, type FC } from 'react';
import { useFormContext } from '../../../../components/ProjectConnection/formContext';
import SnowflakeForm from '../../../../components/ProjectConnection/WarehouseForms/SnowflakeForm';
import ConnectionTestFlow from './ConnectionTestFlow';
import LeastPrivilegeGuidance from './LeastPrivilegeGuidance';

type SnowflakeMethodScreenProps = {
    authenticationType: SnowflakeAuthenticationType;
    showLeastPrivilege?: boolean;
};

const SnowflakeMethodScreen: FC<SnowflakeMethodScreenProps> = ({
    authenticationType,
    showLeastPrivilege = false,
}) => {
    const form = useFormContext();

    useEffect(() => {
        form.setFieldValue('warehouse.authenticationType', authenticationType);
        form.setTouched({ 'warehouse.authenticationType': true });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [authenticationType]);

    return (
        <ConnectionTestFlow>
            {(busy) => (
                <>
                    <SnowflakeForm disabled={busy} />
                    {showLeastPrivilege && <LeastPrivilegeGuidance />}
                </>
            )}
        </ConnectionTestFlow>
    );
};

export default SnowflakeMethodScreen;
