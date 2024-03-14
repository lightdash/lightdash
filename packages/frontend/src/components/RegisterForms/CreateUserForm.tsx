import {
    getEmailSchema,
    getPasswordSchema,
    type CreateUserArgs,
} from '@lightdash/common';
import {
    Anchor,
    Button,
    Flex,
    PasswordInput,
    Stack,
    Text,
    TextInput,
} from '@mantine/core';
import { useForm, zodResolver } from '@mantine/form';
import { type FC } from 'react';
import { z } from 'zod';
import PasswordTextInput from '../PasswordTextInput';

type Props = {
    isLoading: boolean;
    readOnlyEmail?: string;
    onSubmit: (data: CreateUserArgs) => void;
};

const validationSchema = z.object({
    email: getEmailSchema(),
    password: getPasswordSchema(),
});

const CreateUserForm: FC<Props> = ({ isLoading, readOnlyEmail, onSubmit }) => {
    const form = useForm<CreateUserArgs>({
        initialValues: {
            firstName: '',
            lastName: '',
            email: readOnlyEmail || '',
            password: '',
        },
        validate: zodResolver(validationSchema),
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
                <Text mx="auto">
                    Already Registered? <Anchor href="/signin">Sign in</Anchor>
                </Text>
            </Stack>
        </form>
    );
};

export default CreateUserForm;
