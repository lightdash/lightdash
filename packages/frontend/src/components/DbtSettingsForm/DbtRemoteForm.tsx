import React, { FC } from 'react';
import { ProjectType, DbtRemoteProjectConfig } from 'common';
import { DefaultValues } from 'react-hook-form/dist/types/form';
import Form from '../ReactHookForm/Form';
import Input from '../ReactHookForm/Input';
import NumericInput from '../ReactHookForm/NumericInput';

const defaultValues: DefaultValues<DbtRemoteProjectConfig> = {
    type: ProjectType.DBT_REMOTE_SERVER,
    name: '',
    rpc_server_host: '',
    rpc_server_port: 8580,
};

const DbtRemoteForm: FC<{
    values?: DbtRemoteProjectConfig;
    disabled: boolean;
}> = ({ disabled, values = defaultValues }) => (
    <Form<DbtRemoteProjectConfig>
        defaultValues={values}
        disabled={disabled}
        onSubmit={() => undefined}
    >
        <Input
            name="name"
            label="Name"
            rules={{
                required: 'Required field',
            }}
        />
        <Input
            name="rpc_server_host"
            label="RPC server host"
            rules={{
                required: 'Required field',
            }}
        />
        <NumericInput
            name="rpc_server_port"
            label="RPC server port"
            rules={{
                required: 'Required field',
            }}
        />
    </Form>
);

export default DbtRemoteForm;
