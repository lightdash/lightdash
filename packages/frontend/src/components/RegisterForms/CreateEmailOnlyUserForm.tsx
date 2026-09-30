import {
    getEmailSchema,
    type CreateEmailOnlyUserArgs,
} from '@lightdash/common';
import { Anchor, Button, Stack, Text, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { zod4Resolver as zodResolver } from 'mantine-form-zod-resolver';
import { type FC } from 'react';
import { Link } from 'react-router';
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
                    label="Work email"
                    name="email"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    placeholder="maya@acme.com"
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
                    Continue
                </Button>
                <Text mx="auto" mt="md" fz="sm">
                    Already have an account?{' '}
                    <Anchor component={Link} to="/login" fz="sm">
                        Log in
                    </Anchor>
                </Text>
            </Stack>
        </form>
    );
};

export default CreateEmailOnlyUserForm;
