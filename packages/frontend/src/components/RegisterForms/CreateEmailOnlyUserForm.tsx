import {
    getEmailSchema,
    type CreateEmailOnlyUserArgs,
} from '@lightdash/common';
import { Anchor, Button, Stack, Text, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { zod4Resolver as zodResolver } from 'mantine-form-zod-resolver';
import { type FC } from 'react';
import { Trans, useTranslation } from 'react-i18next';
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
    const { t } = useTranslation('auth');
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
                    label={t('login.workEmail')}
                    name="email"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    placeholder={t('login.emailPlaceholder')}
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
                    {t('login.continue')}
                </Button>
                <Text mx="auto" mt="md" fz="sm">
                    <Trans
                        t={t}
                        i18nKey="createUser.alreadyHaveAccount"
                        components={{
                            link: (
                                <Anchor component={Link} to="/login" fz="sm" />
                            ),
                        }}
                    />
                </Text>
            </Stack>
        </form>
    );
};

export default CreateEmailOnlyUserForm;
