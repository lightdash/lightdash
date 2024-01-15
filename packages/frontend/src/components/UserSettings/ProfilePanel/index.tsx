import {
    ApiError,
    LightdashUser,
    UpdateUserArgs,
    validateEmail,
} from '@lightdash/common';
import { Anchor, Button, Stack, Text, TextInput, Tooltip } from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconAlertCircle, IconCircleCheck } from '@tabler/icons-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FC, useCallback, useEffect, useState } from 'react';
import { lightdashApi } from '../../../api';
import useToaster from '../../../hooks/toaster/useToaster';
import {
    useEmailStatus,
    useOneTimePassword,
} from '../../../hooks/useEmailVerification';
import { VerifyEmailModal } from '../../../pages/VerifyEmail';
import { useApp } from '../../../providers/AppProvider';
import { useErrorLogs } from '../../../providers/ErrorLogsProvider';
import MantineIcon from '../../common/MantineIcon';

const updateUserQuery = async (data: Partial<UpdateUserArgs>) =>
    lightdashApi<LightdashUser>({
        url: `/user/me`,
        method: 'PATCH',
        body: JSON.stringify(data),
    });

const ProfilePanel: FC = () => {
    const queryClient = useQueryClient();
    const { user, health } = useApp();
    const { showToastSuccess, showToastError } = useToaster();
    const { appendError } = useErrorLogs();

    const isEmailServerConfigured = health.data?.hasEmailClient;
    const { data, isInitialLoading: statusLoading } = useEmailStatus();
    const {
        mutate: sendVerificationEmail,
        error: sendVerificationEmailError,
        isLoading: emailLoading,
    } = useOneTimePassword();

    const form = useForm({
        initialValues: {
            firstName: user.data?.firstName,
            lastName: user.data?.lastName,
            email: user.data?.email,
        },
    });

    const [showVerifyEmailModal, setShowVerifyEmailModal] =
        useState<boolean>(false);

    const { isLoading: isUpdateUserLoading, mutate: updateUser } = useMutation<
        LightdashUser,
        ApiError,
        Partial<UpdateUserArgs>
    >(updateUserQuery, {
        mutationKey: ['user_update'],
        onSuccess: async () => {
            await queryClient.refetchQueries(['user']);
            await queryClient.refetchQueries(['email_status']);
            showToastSuccess({
                title: 'Success! User details were updated.',
            });
        },
        onError: useCallback(
            (error: ApiError) => {
                const [title, ...rest] = error.error.message.split('\n');
                appendError({
                    title,
                    body: rest.join('\n'),
                });
            },
            [appendError],
        ),
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

    const handleOnSubmit = form.onSubmit(({ firstName, lastName, email }) => {
        if (firstName && lastName && email && validateEmail(email)) {
            updateUser({
                firstName,
                lastName,
                email,
            });
        } else {
            const title =
                email && !validateEmail(email)
                    ? 'Invalid email'
                    : 'Required fields: first name, last name and email';
            showToastError({
                title,
            });
        }
    });

    return (
        <form onSubmit={handleOnSubmit}>
            <Stack mt="md">
                <TextInput
                    id="first-name-input"
                    placeholder="First name"
                    label="First name"
                    type="text"
                    required
                    disabled={isUpdateUserLoading}
                    data-cy="first-name-input"
                    {...form.getInputProps('firstName')}
                />

                <TextInput
                    id="last-name-input"
                    placeholder="Last name"
                    label="Last name"
                    type="text"
                    required
                    disabled={isUpdateUserLoading}
                    data-cy="last-name-input"
                    {...form.getInputProps('lastName')}
                />

                <TextInput
                    id="email-input"
                    placeholder="Email"
                    label="Email"
                    type="email"
                    required
                    disabled={isUpdateUserLoading}
                    inputWrapperOrder={[
                        'label',
                        'input',
                        'error',
                        'description',
                    ]}
                    {...form.getInputProps('email')}
                    data-cy="email-input"
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
                                color="gray.6"
                            />
                        )
                    }
                    descriptionProps={{ mt: 'xs' }}
                    description={
                        isEmailServerConfigured && !data?.isVerified ? (
                            <Text color="dimmed">
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

                <Button
                    type="submit"
                    display="block"
                    ml="auto"
                    loading={isUpdateUserLoading}
                    data-cy="update-profile-settings"
                >
                    Update
                </Button>
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
