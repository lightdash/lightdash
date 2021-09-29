import React, { FC } from 'react';
import { Callout } from '@blueprintjs/core';
import Input from '../../ReactHookForm/Input';

const DbtLocalForm: FC<{ disabled: boolean }> = ({ disabled }) => (
    <>
        <Callout intent="primary" style={{ marginBottom: 20 }}>
            This connection type should only be used for local development. Read
            docs{' '}
            <a
                href="https://docs.lightdash.com/get-started/setup-with-cli#with-local-dbt-project"
                target="_blank"
                rel="noreferrer"
            >
                here
            </a>{' '}
            to know more.
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
