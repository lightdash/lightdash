import { CreateUserArgs } from '@lightdash/common';
import { Button, Flex, PasswordInput, Stack, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import React, { FC } from 'react';
import { isValidEmail } from '../../utils/fieldValidators';

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
            email: '',
            password: '',
        },
        validate: {
            email: (value) =>
                isValidEmail(value) ? 'Your email address is not valid' : null,
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
                />
                <PasswordInput
                    label="Password"
                    name="password"
                    placeholder="Your password"
                    required
                    {...form.getInputProps('password')}
                    disabled={isLoading}
                />
                <Button type="submit" loading={isLoading}>
                    Sign up
                </Button>
            </Stack>
        </form>
    );
};

export default CreateUserForm;
