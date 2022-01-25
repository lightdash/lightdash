import { Intent } from '@blueprintjs/core';
import { CreateUserArgs } from 'common';
import React, { FC } from 'react';
import { useForm } from 'react-hook-form';
import { useApp } from '../providers/AppProvider';
import { isValidEmail } from '../utils/fieldValidators';
import { BigButton } from './common/BigButton';
import Form from './ReactHookForm/Form';
import Input from './ReactHookForm/Input';
import PasswordInput from './ReactHookForm/PasswordInput';

type Props = {
    isLoading: boolean;
    onSubmit: (data: CreateUserArgs) => void;
};

const CreateUserForm: FC<Props> = ({ isLoading, onSubmit }) => {
    const methods = useForm<CreateUserArgs>({
        mode: 'onSubmit',
    });
    const { health } = useApp();

    const disablePasswordAuth = health.allowPasswordAuthentication;

    return (
        <Form name="register" methods={methods} onSubmit={onSubmit}>
            <Input
                label="First name"
                name="firstName"
                placeholder="Jane"
                disabled={isLoading}
                rules={{
                    required: 'Required field',
                }}
            />
            <Input
                label="Last name"
                name="lastName"
                placeholder="Doe"
                disabled={isLoading}
                rules={{
                    required: 'Required field',
                }}
            />
            {!disablePasswordAuth && (
                <Input
                    label="Email"
                    name="email"
                    placeholder="Email"
                    disabled={isLoading}
                    rules={{
                        required: 'Required field',
                        validate: {
                            isValidEmail: isValidEmail('Email'),
                        },
                    }}
                />
            )}
            {!disablePasswordAuth && (
                <PasswordInput
                    label="Password"
                    name="password"
                    placeholder="Enter your password..."
                    disabled={isLoading}
                    rules={{
                        required: 'Required field',
                    }}
                />
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <BigButton
                    type="submit"
                    intent={Intent.PRIMARY}
                    text="Next"
                    loading={isLoading}
                    style={{ minWidth: 82 }}
                />
            </div>
        </Form>
    );
};

export default CreateUserForm;
