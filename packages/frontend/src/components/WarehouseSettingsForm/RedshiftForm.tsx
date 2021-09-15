import React, { FC } from 'react';
import { Button, Intent } from '@blueprintjs/core';
import {
    WarehouseTypes,
    CreateRedshiftCredentials,
    RedshiftCredentials,
} from 'common';
import { DefaultValues } from 'react-hook-form/dist/types/form';
import { useToggle } from 'react-use';
import Form from '../ReactHookForm/Form';
import Input from '../ReactHookForm/Input';
import NumericInput from '../ReactHookForm/NumericInput';
import PasswordInput from '../ReactHookForm/PasswordInput';
import FormSection from '../ReactHookForm/FormSection';

const defaultValues: DefaultValues<CreateRedshiftCredentials> = {
    type: WarehouseTypes.REDSHIFT,
    host: '',
    user: '',
    password: '',
    port: 5439,
    dbname: '',
    schema: '',
    threads: 1,
    keepalivesIdle: 0,
    sslmode: undefined,
};

const RedshiftForm: FC<{
    values?: RedshiftCredentials;
    loading: boolean;
    onSave: (data: CreateRedshiftCredentials) => void;
}> = ({ values = defaultValues, loading, onSave }) => {
    const [isOpen, toggleOpen] = useToggle(false);
    return (
        <Form<CreateRedshiftCredentials>
            defaultValues={values}
            disabled={loading}
            onSubmit={onSave}
        >
            <Input
                name="host"
                label="Host"
                rules={{
                    required: 'Required field',
                }}
            />
            <Input
                name="user"
                label="User"
                rules={{
                    required: 'Required field',
                }}
            />
            <PasswordInput
                name="password"
                label="Password"
                rules={{
                    required: 'Required field',
                }}
            />
            <NumericInput
                name="port"
                label="Port"
                rules={{
                    required: 'Required field',
                }}
            />
            <Input
                name="dbname"
                label="DB name"
                rules={{
                    required: 'Required field',
                }}
            />
            <Input
                name="schema"
                label="Schema"
                rules={{
                    required: 'Required field',
                }}
            />
            <FormSection isOpen={isOpen} name="advanced">
                <NumericInput
                    name="threads"
                    label="Threads"
                    rules={{
                        required: 'Required field',
                    }}
                />
                <NumericInput
                    name="keepalivesIdle"
                    label="Keep alive idle (seconds)"
                    rules={{
                        required: 'Required field',
                    }}
                />
                <Input name="sslmode" label="SSL mode" />
            </FormSection>
            <div
                style={{
                    display: 'flex',
                    marginTop: 20,
                    justifyContent: 'flex-end',
                }}
            >
                <Button
                    minimal
                    text={`${isOpen ? 'Hide' : 'Show'} advanced fields`}
                    onClick={toggleOpen}
                    style={{
                        marginRight: 10,
                    }}
                />
                <Button
                    type="submit"
                    intent={Intent.PRIMARY}
                    text="Save"
                    loading={loading}
                />
            </div>
        </Form>
    );
};

export default RedshiftForm;
