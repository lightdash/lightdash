import { Intent } from '@blueprintjs/core';
import { CreateUserArgs } from '@lightdash/common';
import React, { FC } from 'react';
import { useForm } from 'react-hook-form';
import { isValidEmail } from '../../utils/fieldValidators';
import Form from '../ReactHookForm/Form';
import Input from '../ReactHookForm/Input';
import PasswordInput from '../ReactHookForm/PasswordInput';
import { SubmitButton } from './CreateUserForm.styles';

type Props = {
    isLoading: boolean;
    readOnlyEmail?: string;
    onSubmit: (data: CreateUserArgs) => void;
};

const CreateUserForm: FC<Props> = ({ isLoading, readOnlyEmail, onSubmit }) => {
    const methods = useForm<CreateUserArgs>({
        mode: 'onSubmit',
        defaultValues: {
            email: readOnlyEmail,
        },
    });

    return (
        <Form name="register" methods={methods} onSubmit={onSubmit}>
            <Input
                label="First name"
                name="firstName"
                placeholder="David"
                disabled={isLoading}
                rules={{
                    required: 'Required field',
                }}
            />
            <Input
                label="Last name"
                name="lastName"
                placeholder="Attenborough"
                disabled={isLoading}
                rules={{
                    required: 'Required field',
                }}
            />
            <Input
                label="Email address"
                name="email"
                placeholder="d.attenborough@greenplanet.com"
                disabled={isLoading || !!readOnlyEmail}
                rules={{
                    required: 'Required field',
                    validate: {
                        isValidEmail: isValidEmail('Email'),
                    },
                }}
            />
            <PasswordInput
                label="Password"
                name="password"
                placeholder="Enter a password"
                disabled={isLoading}
                rules={{
                    required: 'Required field',
                }}
            />
            <SubmitButton
                type="submit"
                intent={Intent.PRIMARY}
                text="Sign up"
                loading={isLoading}
            />
        </Form>
    );
};

export default CreateUserForm;
