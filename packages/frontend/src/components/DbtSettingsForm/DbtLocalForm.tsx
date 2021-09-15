import React, { FC } from 'react';
import { ProjectType, DbtLocalProjectConfig } from 'common';
import { DefaultValues } from 'react-hook-form/dist/types/form';
import Form from '../ReactHookForm/Form';
import Input from '../ReactHookForm/Input';

const defaultValues: DefaultValues<DbtLocalProjectConfig> = {
    type: ProjectType.DBT,
    profiles_dir: '',
    project_dir: '',
    rpc_server_port: 8580,
    target: undefined,
};

const DbtLocalForm: FC<{
    values?: DbtLocalProjectConfig;
    disabled: boolean;
}> = ({ disabled, values = defaultValues }) => (
    <Form<DbtLocalProjectConfig>
        defaultValues={values}
        disabled={disabled}
        onSubmit={() => undefined}
    >
        <Input
            name="profiles_dir"
            label="Profiles directory"
            rules={{
                required: 'Required field',
            }}
        />
        <Input
            name="project_dir"
            label="Project directory"
            rules={{
                required: 'Required field',
            }}
        />
        <Input name="target" label="Profile target" />
    </Form>
);

export default DbtLocalForm;
