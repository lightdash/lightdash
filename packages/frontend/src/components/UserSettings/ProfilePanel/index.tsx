import {
    FeatureFlags,
    getEmailSchema,
    getUserNameSchema,
    isValidTimezone,
    type ApiError,
} from '@lightdash/common';
import {
    Anchor,
    Button,
    Flex,
    Stack,
    Text,
    TextInput,
    Tooltip,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconAlertCircle, IconCircleCheck } from '@tabler/icons-react';
import { type TFunction } from 'i18next';
import { zod4Resolver as zodResolver } from 'mantine-form-zod-resolver';
import { useEffect, useMemo, useState, type FC } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { z } from 'zod';
import useToaster from '../../../hooks/toaster/useToaster';
import {
    useEmailStatus,
    useOneTimePassword,
} from '../../../hooks/useEmailVerification';
import { useUserUpdateMutation } from '../../../hooks/user/useUserUpdateMutation';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import { LanguageSwitcher } from '../../../i18n/LanguageSwitcher';
import { VerifyEmailModal } from '../../../pages/VerifyEmail';
import useApp from '../../../providers/App/useApp';
import MantineIcon from '../../common/MantineIcon';
import TimeZonePicker from '../../common/TimeZonePicker';
import AvatarSettings from './AvatarSettings';

const getValidationSchema = (t: TFunction) =>
    z.object({
        firstName: getUserNameSchema(),
        lastName: getUserNameSchema(),
        email: getEmailSchema().or(z.undefined()),
        timezone: z
            .string()
            .nullable()
            .refine(
                (value) => value === null || isValidTimezone(value),
                t('profilePanel.validation.invalidTimezone'),
            ),
    });

type FormValues = z.infer<ReturnType<typeof getValidationSchema>>;

const ProfilePanel: FC = () => {
    const { t } = useTranslation('userSettings');
    const validationSchema = useMemo(() => getValidationSchema(t), [t]);
    const {
        user: { data: userData, isLoading: isLoadingUser },
        health,
    } = useApp();
    const { showToastSuccess, showToastApiError } = useToaster();

    const { data: timezoneSupportFlag } = useServerFeatureFlag(
        FeatureFlags.EnableTimezoneSupport,
    );
    const timezoneSupportEnabled = timezoneSupportFlag?.enabled === true;

    const form = useForm<FormValues>({
        validate: zodResolver(validationSchema),
    });

    useEffect(() => {
        if (!userData) return;

        const initialValues = {
            firstName: userData.firstName,
            lastName: userData.lastName,
            email: userData.email,
            timezone: userData.timezone ?? null,
        };

        if (form.initialized) {
            form.setInitialValues(initialValues);
            form.setValues(initialValues);
        } else {
            form.initialize(initialValues);
        }

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userData]);

    const isEmailServerConfigured = health.data?.hasEmailClient;
    const { data, isInitialLoading: statusLoading } = useEmailStatus(
        !!health.data?.isAuthenticated,
    );
    const {
        mutate: sendVerificationEmail,
        error: sendVerificationEmailError,
        isLoading: emailLoading,
    } = useOneTimePassword();

    const [showVerifyEmailModal, setShowVerifyEmailModal] =
        useState<boolean>(false);

    const { isLoading: isUpdatingUser, mutate: updateUser } =
        useUserUpdateMutation({
            onSuccess: () => {
                showToastSuccess({
                    title: t('profilePanel.toasts.updateSuccess'),
                });
            },
            onError: ({ error }: ApiError) => {
                showToastApiError({
                    title: t('profilePanel.toasts.updateFailed'),
                    apiError: error,
                });
            },
        });

    useEffect(() => {
        if (
            sendVerificationEmailError ||
            data?.isVerified ||
            !isEmailServerConfigured
        ) {
            setShowVerifyEmailModal(false);
        }
    }, [data?.isVerified, isEmailServerConfigured, sendVerificationEmailError]);

    const handleOnSubmit = form.onSubmit((formValues) => {
        if (!form.isValid()) return;
        updateUser(formValues);
    });

    const isLoading = isLoadingUser || isUpdatingUser || !form.initialized;

    return (
        <form onSubmit={handleOnSubmit}>
            <Stack mt="md">
                <AvatarSettings />

                <TextInput
                    placeholder={t('profilePanel.firstName')}
                    label={t('profilePanel.firstName')}
                    type="text"
                    required
                    disabled={isLoading}
                    {...form.getInputProps('firstName')}
                />

                <TextInput
                    placeholder={t('profilePanel.lastName')}
                    label={t('profilePanel.lastName')}
                    type="text"
                    required
                    disabled={isLoading}
                    {...form.getInputProps('lastName')}
                />

                <TextInput
                    placeholder={t('profilePanel.email')}
                    label={t('profilePanel.email')}
                    type="email"
                    required
                    disabled={isLoading}
                    inputWrapperOrder={[
                        'label',
                        'input',
                        'error',
                        'description',
                    ]}
                    {...form.getInputProps('email')}
                    rightSection={
                        isEmailServerConfigured && data?.isVerified ? (
                            <Tooltip label={t('profilePanel.emailVerified')}>
                                <MantineIcon
                                    size="lg"
                                    icon={IconCircleCheck}
                                    color="green.6"
                                />
                            </Tooltip>
                        ) : (
                            <MantineIcon
                                size="lg"
                                icon={IconAlertCircle}
                                color="dimmed"
                            />
                        )
                    }
                    descriptionProps={{ mt: 'xs' }}
                    description={
                        isEmailServerConfigured && !data?.isVerified ? (
                            <Text c="dimmed">
                                <Trans
                                    t={t}
                                    i18nKey="profilePanel.emailNotVerified"
                                    components={{
                                        verifyLink: (
                                            <Anchor
                                                component="span"
                                                onClick={() => {
                                                    if (!data?.otp) {
                                                        sendVerificationEmail();
                                                    }
                                                    setShowVerifyEmailModal(
                                                        true,
                                                    );
                                                }}
                                            />
                                        ),
                                    }}
                                />
                            </Text>
                        ) : null
                    }
                />

                {timezoneSupportEnabled && (
                    <TimeZonePicker
                        label={t('profilePanel.timezone.label')}
                        description={t('profilePanel.timezone.description')}
                        variant="default"
                        maw="100%"
                        size="sm"
                        searchable
                        clearable
                        placeholder={t('profilePanel.timezone.placeholder')}
                        disabled={isLoading}
                        {...form.getInputProps('timezone')}
                    />
                )}

                <LanguageSwitcher />

                <Flex justify="flex-end" gap="sm">
                    {form.isDirty() && !isUpdatingUser && (
                        <Button variant="outline" onClick={() => form.reset()}>
                            {t('actions.cancel', { ns: 'common' })}
                        </Button>
                    )}
                    <Button
                        type="submit"
                        loading={isLoading}
                        disabled={!form.isDirty()}
                    >
                        {t('actions.update', { ns: 'common' })}
                    </Button>
                </Flex>

                <VerifyEmailModal
                    opened={showVerifyEmailModal}
                    onClose={() => {
                        setShowVerifyEmailModal(false);
                    }}
                    isLoading={statusLoading || emailLoading}
                />
            </Stack>
        </form>
    );
};

export default ProfilePanel;
