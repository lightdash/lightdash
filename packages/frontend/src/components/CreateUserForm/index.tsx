import { Intent } from '@blueprintjs/core';
import { CreateUserArgs } from '@lightdash/common';
import { FC } from 'react';
import { useForm } from 'react-hook-form';
import { isValidEmail } from '../../utils/fieldValidators';
import Form from '../ReactHookForm/Form';
import {
    InputField,
    InputsGroup,
    PasswordInputField,
    SubmitButton,
} from './CreateUserForm.styles';

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
            <InputsGroup>
                <InputField
                    label="First name"
                    name="firstName"
                    placeholder="First name"
                    disabled={isLoading}
                    rules={{
                        required: 'Required field',
                    }}
                />
                <InputField
                    label="Last name"
                    name="lastName"
                    placeholder="Last name"
                    disabled={isLoading}
                    rules={{
                        required: 'Required field',
                    }}
                />
            </InputsGroup>
            <InputField
                label="Email address"
                name="email"
                placeholder="Email"
                disabled={isLoading || !!readOnlyEmail}
                rules={{
                    required: 'Required field',
                    validate: {
                        isValidEmail: isValidEmail('Email'),
                    },
                }}
            />
            <PasswordInputField
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
