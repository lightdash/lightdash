import React, { FC } from 'react';
import Input from '../../ReactHookForm/Input';
import NumericInput from '../../ReactHookForm/NumericInput';

const DbtRemoteForm: FC<{ disabled: boolean }> = ({ disabled }) => (
    <>
        <Input
            name="dbt.rpc_server_host"
            label="RPC server host"
            rules={{
                required: 'Required field',
            }}
            disabled={disabled}
        />
        <NumericInput
            name="dbt.rpc_server_port"
            label="RPC server port"
            rules={{
                required: 'Required field',
            }}
            disabled={disabled}
            defaultValue={8580}
        />
    </>
);

export default DbtRemoteForm;
