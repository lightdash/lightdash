import {
    ApiError,
    getEmailSchema,
    LightdashUser,
    UpdateUserArgs,
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
import { useForm, zodResolver } from '@mantine/form';
import { IconAlertCircle, IconCircleCheck } from '@tabler/icons-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FC, useCallback, useEffect, useState } from 'react';
import { z } from 'zod';
import { lightdashApi } from '../../../api';
import useToaster from '../../../hooks/toaster/useToaster';
import {
    useEmailStatus,
    useOneTimePassword,
} from '../../../hooks/useEmailVerification';
import { VerifyEmailModal } from '../../../pages/VerifyEmail';
import { useApp } from '../../../providers/AppProvider';
import MantineIcon from '../../common/MantineIcon';

const updateUserQuery = async (data: Partial<UpdateUserArgs>) =>
    lightdashApi<LightdashUser>({
        url: `/user/me`,
        method: 'PATCH',
        body: JSON.stringify(data),
    });

const validationSchema = z.object({
    firstName: z.string().nonempty(),
    lastName: z.string().nonempty(),
    email: getEmailSchema().or(z.undefined()),
});

type FormValues = z.infer<typeof validationSchema>;

const ProfilePanel: FC = () => {
    const queryClient = useQueryClient();
    const {
        user: { data: userData, isInitialLoading: isLoadingUser },
        health,
    } = useApp();
    const { showToastSuccess, showToastError } = useToaster();

    const form = useForm<FormValues>({
        initialValues: {
            firstName: '',
            lastName: '',
            email: '',
        },
        validate: zodResolver(validationSchema),
    });

    useEffect(() => {
        if (isLoadingUser || !userData) return;

        const initialValues = {
            firstName: userData.firstName,
            lastName: userData.lastName,
            email: userData.email,
        };

        form.setInitialValues(initialValues);
        form.setValues(initialValues);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isLoadingUser, userData]);

    const isEmailServerConfigured = health.data?.hasEmailClient;
    const { data, isInitialLoading: statusLoading } = useEmailStatus();
    const {
        mutate: sendVerificationEmail,
        error: sendVerificationEmailError,
        isLoading: emailLoading,
    } = useOneTimePassword();

    const [showVerifyEmailModal, setShowVerifyEmailModal] =
        useState<boolean>(false);

    const { isLoading: isUpdatingUser, mutate: updateUser } = useMutation<
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
                showToastError({
                    title,
                    subtitle: rest.join('\n'),
                });
            },
            [showToastError],
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

    const handleOnSubmit = form.onSubmit((formValues) => {
        if (!form.isValid()) return;
        updateUser(formValues);
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
                    disabled={isLoadingUser || isUpdatingUser}
                    data-cy="first-name-input"
                    {...form.getInputProps('firstName')}
                />

                <TextInput
                    id="last-name-input"
                    placeholder="Last name"
                    label="Last name"
                    type="text"
                    required
                    disabled={isLoadingUser || isUpdatingUser}
                    data-cy="last-name-input"
                    {...form.getInputProps('lastName')}
                />

                <TextInput
                    id="email-input"
                    placeholder="Email"
                    label="Email"
                    type="email"
                    required
                    disabled={isLoadingUser || isUpdatingUser}
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

                <Flex justify="flex-end" gap="sm">
                    {form.isDirty() && !isUpdatingUser && (
                        <Button variant="outline" onClick={() => form.reset()}>
                            Cancel
                        </Button>
                    )}
                    <Button
                        type="submit"
                        display="block"
                        loading={isLoadingUser || isUpdatingUser}
                        data-cy="update-profile-settings"
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
