import React, { FC } from 'react';
import { Button, Intent } from '@blueprintjs/core';
import {
    WarehouseTypes,
    CreateSnowflakeCredentials,
    SnowflakeCredentials,
} from 'common';
import { DefaultValues } from 'react-hook-form/dist/types/form';
import { useToggle } from 'react-use';
import Form from '../ReactHookForm/Form';
import Input from '../ReactHookForm/Input';
import NumericInput from '../ReactHookForm/NumericInput';
import SelectField from '../ReactHookForm/Select';
import PasswordInput from '../ReactHookForm/PasswordInput';
import FormSection from '../ReactHookForm/FormSection';

const defaultValues: DefaultValues<CreateSnowflakeCredentials> = {
    type: WarehouseTypes.SNOWFLAKE,
    account: '',
    user: '',
    password: '',
    role: '',
    database: '',
    warehouse: '',
    schema: '',
    threads: 1,
    clientSessionKeepAlive: false,
    queryTag: undefined,
};

const SnowflakeForm: FC<{
    values?: SnowflakeCredentials;
    loading: boolean;
    onSave: (data: CreateSnowflakeCredentials) => void;
}> = ({ values = defaultValues, loading, onSave }) => {
    const [isOpen, toggleOpen] = useToggle(false);
    return (
        <Form<CreateSnowflakeCredentials>
            defaultValues={values}
            disabled={loading}
            onSubmit={onSave}
        >
            <Input
                name="accout"
                label="Account"
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
            <Input
                name="role"
                label="Role"
                rules={{
                    required: 'Required field',
                }}
            />
            <Input
                name="database"
                label="Database"
                rules={{
                    required: 'Required field',
                }}
            />
            <Input
                name="warehouse"
                label="Warehouse"
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
                <SelectField
                    name="clientSessionKeepAlive"
                    label="Keep client session alive"
                    options={[
                        {
                            value: 1,
                            label: 'Yes',
                        },
                        {
                            value: 0,
                            label: 'No',
                        },
                    ]}
                    rules={{
                        required: 'Required field',
                    }}
                />
                <Input name="queryTag" label="Query tag" />
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

export default SnowflakeForm;
