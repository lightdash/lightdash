import {
    CreateUserArgs,
    passwordSchema,
    validateEmail,
} from '@lightdash/common';
import { Button, Flex, PasswordInput, Stack, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import React, { FC } from 'react';
import PasswordTextInput from '../PasswordTextInput';

type Props = {
    isLoading: boolean;
    readOnlyEmail?: string;
    onSubmit: (data: CreateUserArgs) => void;
};

const CreateUserForm: FC<Props> = ({ isLoading, readOnlyEmail, onSubmit }) => {
    const form = useForm<CreateUserArgs>({
        initialValues: {
            firstName: '',
            lastName: '',
            email: readOnlyEmail || '',
            password: '',
        },
        validate: {
            email: (value) =>
                readOnlyEmail || validateEmail(value)
                    ? null
                    : 'Your email address is not valid',
            password: (value) => {
                const result = passwordSchema.safeParse(value);
                if (result.success) {
                    return null;
                }
                return result.error.issues.map((issue) => issue.message);
            },
        },
    });

    return (
        <form name="register" onSubmit={form.onSubmit(onSubmit)}>
            <Stack spacing="md">
                <Flex direction="row" gap="xs">
                    <TextInput
                        label="First name"
                        name="firstName"
                        placeholder="Your first name"
                        disabled={isLoading}
                        required
                        {...form.getInputProps('firstName')}
                    />
                    <TextInput
                        label="Last name"
                        name="lastName"
                        placeholder="Your last name"
                        disabled={isLoading}
                        required
                        {...form.getInputProps('lastName')}
                    />
                </Flex>
                <TextInput
                    label="Email address"
                    name="email"
                    placeholder="Your email address"
                    required
                    {...form.getInputProps('email')}
                    disabled={isLoading || !!readOnlyEmail}
                    data-cy="email-address-input"
                />
                <PasswordTextInput
                    passwordValue={form.values.password as string}
                >
                    <PasswordInput
                        label="Password"
                        name="password"
                        placeholder="Your password"
                        required
                        {...form.getInputProps('password')}
                        onChange={(event) => {
                            form.getInputProps('password').onChange(event);
                        }}
                        data-cy="password-input"
                        disabled={isLoading}
                    />
                </PasswordTextInput>
                <Button
                    type="submit"
                    loading={isLoading}
                    disabled={isLoading}
                    data-cy="signup-button"
                >
                    Sign up
                </Button>
            </Stack>
        </form>
    );
};

export default CreateUserForm;
