import React, { FC } from 'react';
import { Button, Intent } from '@blueprintjs/core';
import {
    WarehouseTypes,
    CreatePostgresCredentials,
    PostgresCredentials,
} from 'common';
import { DefaultValues } from 'react-hook-form/dist/types/form';
import { useToggle } from 'react-use';
import Form from '../ReactHookForm/Form';
import Input from '../ReactHookForm/Input';
import PasswordInput from '../ReactHookForm/PasswordInput';
import FormSection from '../ReactHookForm/FormSection';
import NumericInput from '../ReactHookForm/NumericInput';

const defaultValues: DefaultValues<CreatePostgresCredentials> = {
    type: WarehouseTypes.POSTGRES,
    host: '',
    user: '',
    password: '',
    port: 5432,
    dbname: '',
    schema: '',
    threads: 1,
    keepalivesIdle: 0,
    searchPath: undefined,
    role: undefined,
    sslmode: undefined,
};

const PostgresForm: FC<{
    values?: PostgresCredentials;
    loading: boolean;
    onSave: (data: CreatePostgresCredentials) => void;
}> = ({ values = defaultValues, loading, onSave }) => {
    const [isOpen, toggleOpen] = useToggle(false);
    return (
        <Form<CreatePostgresCredentials>
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
                <Input name="searchPath" label="Search path" />
                <Input name="sslmode" label="SSL mode" />
                <Input name="role" label="Role" />
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

export default PostgresForm;
