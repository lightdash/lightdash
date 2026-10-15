import {
    getEmailSchema,
    getPasswordSchema,
    getUserNameSchema,
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
import { useForm } from '@mantine/form';
import { zod4Resolver as zodResolver } from 'mantine-form-zod-resolver';
import { type FC } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { z } from 'zod';
import PasswordTextInput from '../PasswordTextInput';

type Props = {
    isLoading: boolean;
    readOnlyEmail?: string;
    onSubmit: (data: CreateUserArgs) => void;
};

const validationSchema = z.object({
    firstName: getUserNameSchema(),
    lastName: getUserNameSchema(),
    email: getEmailSchema(),
    password: getPasswordSchema(),
});

const CreateUserForm: FC<Props> = ({ isLoading, readOnlyEmail, onSubmit }) => {
    const { t } = useTranslation('auth');
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
            <Stack gap="md">
                <Flex direction={{ base: 'column', sm: 'row' }} gap="xs">
                    <TextInput
                        label={t('createUser.firstName')}
                        name="firstName"
                        autoComplete="given-name"
                        flex={1}
                        placeholder={t('createUser.firstNamePlaceholder')}
                        disabled={isLoading}
                        required
                        {...form.getInputProps('firstName')}
                    />
                    <TextInput
                        label={t('createUser.lastName')}
                        name="lastName"
                        autoComplete="family-name"
                        flex={1}
                        placeholder={t('createUser.lastNamePlaceholder')}
                        disabled={isLoading}
                        required
                        {...form.getInputProps('lastName')}
                    />
                </Flex>
                <TextInput
                    label={t('login.emailAddress')}
                    name="email"
                    type="email"
                    autoComplete="email"
                    placeholder={t('login.emailPlaceholderLegacy')}
                    required
                    {...form.getInputProps('email')}
                    disabled={isLoading || !!readOnlyEmail}
                    data-cy="email-address-input"
                />
                <PasswordTextInput
                    passwordValue={form.values.password as string}
                >
                    <PasswordInput
                        label={t('login.password')}
                        name="password"
                        autoComplete="new-password"
                        placeholder={t('login.passwordPlaceholder')}
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
                    {t('login.signUp')}
                </Button>
                <Text mx="auto" c="ldGray.7" ta="center" fz="sm" fw={500}>
                    <Trans
                        t={t}
                        i18nKey="createUser.alreadyRegistered"
                        components={{
                            link: (
                                <Anchor
                                    component={Link}
                                    to="/login"
                                    fz="sm"
                                    fw={500}
                                />
                            ),
                        }}
                    />
                </Text>
            </Stack>
        </form>
    );
};

export default CreateUserForm;
