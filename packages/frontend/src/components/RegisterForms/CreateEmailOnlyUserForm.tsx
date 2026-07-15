import {
    getEmailSchema,
    type CreateEmailOnlyUserArgs,
} from '@lightdash/common';
import { Anchor, Button, Stack, Text, TextInput } from '@mantine-8/core';
import { useForm, zodResolver } from '@mantine/form';
import { type FC } from 'react';
import { z } from 'zod';

type Props = {
    isLoading: boolean;
    onSubmit: (data: CreateEmailOnlyUserArgs) => void;
};

const validationSchema = z.object({
    email: getEmailSchema(),
});

const CreateEmailOnlyUserForm: FC<Props> = ({ isLoading, onSubmit }) => {
    const form = useForm<CreateEmailOnlyUserArgs>({
        initialValues: {
            email: '',
        },
        validate: zodResolver(validationSchema),
    });

    return (
        <form name="register" onSubmit={form.onSubmit(onSubmit)}>
            <Stack gap="md">
                <TextInput
                    label="Email address"
                    name="email"
                    placeholder="Your email address"
                    required
                    {...form.getInputProps('email')}
                    disabled={isLoading}
                    data-cy="email-address-input"
                />
                <Button
                    type="submit"
                    loading={isLoading}
                    disabled={isLoading}
                    data-cy="signup-button"
                >
                    Sign up
                </Button>
                <Text mx="auto" c="ldGray.7" ta="center" fz="sm" fw={500}>
                    Already Registered?{' '}
                    <Anchor href="/signin" fz="sm" fw={500}>
                        Sign in
                    </Anchor>
                </Text>
            </Stack>
        </form>
    );
};

export default CreateEmailOnlyUserForm;
