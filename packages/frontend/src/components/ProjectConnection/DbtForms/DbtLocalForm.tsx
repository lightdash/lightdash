import React, { FC } from 'react';
import { Callout } from '@blueprintjs/core';
import Input from '../../ReactHookForm/Input';

const DbtLocalForm: FC<{ disabled: boolean }> = ({ disabled }) => (
    <>
        <Callout intent="primary" style={{ marginBottom: 20 }}>
            This connection type should only be used for local development.
        </Callout>
        <Input
            name="dbt.project_dir"
            label="Project directory"
            rules={{
                required: 'Required field',
            }}
            disabled={disabled}
        />
    </>
);

export default DbtLocalForm;
