import React, { FC } from 'react';
import { Callout } from '@blueprintjs/core';
import Input from '../../ReactHookForm/Input';
import NumericInput from '../../ReactHookForm/NumericInput';

const DbtRemoteForm: FC<{ disabled: boolean }> = ({ disabled }) => (
    <>
        <Callout intent="warning" style={{ marginBottom: 20 }}>
            dbt is planning to deprecate the rpc server soon so we suggest using
            a different way to connect your dbt project. Read docs{' '}
            <a
                href="https://docs.lightdash.com/get-started/setup-lightdash/connect-project#dbt-remote-server"
                target="_blank"
                rel="noreferrer"
            >
                here
            </a>{' '}
            to know more.
        </Callout>
        <Input
            name="dbt.rpc_server_host"
            label="RPC server host"
            documentationUrl="https://docs.lightdash.com/get-started/setup-lightdash/connect-project#rpc-server-host"
            rules={{
                required: 'Required field',
            }}
            disabled={disabled}
        />
        <NumericInput
            name="dbt.rpc_server_port"
            label="RPC server port"
            documentationUrl="https://docs.lightdash.com/get-started/setup-lightdash/connect-project#rpc-server-port"
            rules={{
                required: 'Required field',
            }}
            disabled={disabled}
            defaultValue={8580}
        />
    </>
);

export default DbtRemoteForm;
