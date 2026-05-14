import {
    FeatureFlags,
    getEmailSchema,
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
} from '@mantine-8/core';
import { useForm, zodResolver } from '@mantine/form';
import { IconAlertCircle, IconCircleCheck } from '@tabler/icons-react';
import { useEffect, useState, type FC } from 'react';
import { z } from 'zod';
import useToaster from '../../../hooks/toaster/useToaster';
import {
    useEmailStatus,
    useOneTimePassword,
} from '../../../hooks/useEmailVerification';
import { useUserUpdateMutation } from '../../../hooks/user/useUserUpdateMutation';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import { VerifyEmailModal } from '../../../pages/VerifyEmail';
import useApp from '../../../providers/App/useApp';
import MantineIcon from '../../common/MantineIcon';
import TimeZonePicker from '../../common/TimeZonePicker';

const validationSchema = z.object({
    firstName: z.string().nonempty(),
    lastName: z.string().nonempty(),
    email: getEmailSchema().or(z.undefined()),
    timezone: z
        .string()
        .nullable()
        .refine(
            (value) => value === null || isValidTimezone(value),
            'Invalid timezone',
        ),
});

type FormValues = z.infer<typeof validationSchema>;

const ProfilePanel: FC = () => {
    const {
        user: { data: userData, isLoading: isLoadingUser },
        health,
    } = useApp();
    const { showToastSuccess, showToastApiError } = useToaster();

    const { data: userTimezonesFlag } = useServerFeatureFlag(
        FeatureFlags.EnableUserTimezones,
    );
    const userTimezonesEnabled = userTimezonesFlag?.enabled === true;

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
                    title: 'Success! User details were updated.',
                });
            },
            onError: ({ error }: ApiError) => {
                showToastApiError({
                    title: 'Failed to update user details',
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
                <TextInput
                    placeholder="First name"
                    label="First name"
                    type="text"
                    required
                    disabled={isLoading}
                    {...form.getInputProps('firstName')}
                />

                <TextInput
                    placeholder="Last name"
                    label="Last name"
                    type="text"
                    required
                    disabled={isLoading}
                    {...form.getInputProps('lastName')}
                />

                <TextInput
                    placeholder="Email"
                    label="Email"
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
                            <Tooltip label="This e-mail has been verified">
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
                                color="ldGray.6"
                            />
                        )
                    }
                    descriptionProps={{ mt: 'xs' }}
                    description={
                        isEmailServerConfigured && !data?.isVerified ? (
                            <Text c="dimmed">
                                This email has not been verified.{' '}
                                <Anchor
                                    component="span"
                                    onClick={() => {
                                        if (!data?.otp) {
                                            sendVerificationEmail();
                                        }
                                        setShowVerifyEmailModal(true);
                                    }}
                                >
                                    Click here to verify it
                                </Anchor>
                                .
                            </Text>
                        ) : null
                    }
                />

                {userTimezonesEnabled && (
                    <TimeZonePicker
                        label="Default timezone"
                        description="Used to render query results when a chart hasn't pinned its own timezone. Leave empty to use the project default."
                        variant="default"
                        maw="100%"
                        size="sm"
                        searchable
                        clearable
                        placeholder="Project default"
                        disabled={isLoading}
                        {...form.getInputProps('timezone')}
                    />
                )}

                <Flex justify="flex-end" gap="sm">
                    {form.isDirty() && !isUpdatingUser && (
                        <Button variant="outline" onClick={() => form.reset()}>
                            Cancel
                        </Button>
                    )}
                    <Button
                        type="submit"
                        loading={isLoading}
                        disabled={!form.isDirty()}
                    >
                        Update
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
