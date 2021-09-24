import React, { FC } from 'react';
import { Button } from '@blueprintjs/core';
import { useToggle } from 'react-use';
import Input from '../../ReactHookForm/Input';
import NumericInput from '../../ReactHookForm/NumericInput';
import SelectField from '../../ReactHookForm/Select';
import PasswordInput from '../../ReactHookForm/PasswordInput';
import FormSection from '../../ReactHookForm/FormSection';

const SnowflakeForm: FC<{
    disabled: boolean;
}> = ({ disabled }) => {
    const [isOpen, toggleOpen] = useToggle(false);
    return (
        <>
            <Input
                name="warehouse.accout"
                label="Account"
                rules={{
                    required: 'Required field',
                }}
                disabled={disabled}
            />
            <Input
                name="warehouse.user"
                label="User"
                rules={{
                    required: 'Required field',
                }}
                disabled={disabled}
            />
            <PasswordInput
                name="warehouse.password"
                label="Password"
                rules={{
                    required: 'Required field',
                }}
                disabled={disabled}
            />
            <Input
                name="warehouse.role"
                label="Role"
                rules={{
                    required: 'Required field',
                }}
                disabled={disabled}
            />
            <Input
                name="warehouse.database"
                label="Database"
                rules={{
                    required: 'Required field',
                }}
                disabled={disabled}
            />
            <Input
                name="warehouse.warehouse"
                label="Warehouse"
                rules={{
                    required: 'Required field',
                }}
                disabled={disabled}
            />
            <Input
                name="warehouse.schema"
                label="Schema"
                rules={{
                    required: 'Required field',
                }}
                disabled={disabled}
            />
            <FormSection isOpen={isOpen} name="advanced">
                <NumericInput
                    name="warehouse.threads"
                    label="Threads"
                    rules={{
                        required: 'Required field',
                    }}
                    disabled={disabled}
                    defaultValue={1}
                />
                <SelectField
                    name="warehouse.clientSessionKeepAlive"
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
                    disabled={disabled}
                    defaultValue={0}
                />
                <Input
                    name="warehouse.queryTag"
                    label="Query tag"
                    disabled={disabled}
                />
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
            </div>
        </>
    );
};

export default SnowflakeForm;
