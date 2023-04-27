import {
    Button,
    Colors,
    FormGroup,
    Icon,
    InputGroup,
    Intent,
} from '@blueprintjs/core';
import { Tooltip2 } from '@blueprintjs/popover2';
import {
    ApiError,
    LightdashUser,
    UpdateUserArgs,
    validateEmail,
} from '@lightdash/common';
import { Anchor, Box, Text } from '@mantine/core';
import { FC, useEffect, useState } from 'react';
import { useMutation, useQueryClient } from 'react-query';
import { lightdashApi } from '../../../api';
import useToaster from '../../../hooks/toaster/useToaster';
import {
    useEmailStatus,
    useOneTimePassword,
} from '../../../hooks/useEmailVerification';
import { VerifyEmailModal } from '../../../pages/VerifyEmail';
import { useApp } from '../../../providers/AppProvider';
import { useErrorLogs } from '../../../providers/ErrorLogsProvider';

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
    const { showError } = useErrorLogs();

    const isEmailServerConfigured = health.data?.hasEmailClient;
    const { data, isLoading: statusLoading } = useEmailStatus();
    const {
        mutate: sendVerificationEmail,
        error: sendVerificationEmailError,
        isLoading: emailLoading,
    } = useOneTimePassword();

    const [firstName, setFirstName] = useState<string | undefined>(
        user.data?.firstName,
    );
    const [lastName, setLastName] = useState<string | undefined>(
        user.data?.lastName,
    );
    const [email, setEmail] = useState<string | undefined>(user.data?.email);
    const [showVerifyEmailModal, setShowVerifyEmailModal] =
        useState<boolean>(false);

    const { isLoading, error, mutate } = useMutation<
        LightdashUser,
        ApiError,
        Partial<UpdateUserArgs>
    >(updateUserQuery, {
        mutationKey: ['user_update'],
        onSuccess: async () => {
            await queryClient.refetchQueries('user');
            await queryClient.refetchQueries('email_status');
            showToastSuccess({
                title: 'Success! User details were updated.',
            });
        },
    });

    useEffect(() => {
        if (error) {
            const [title, ...rest] = error.error.message.split('\n');
            showError({
                title,
                body: rest.join('\n'),
            });
        }
        if (
            sendVerificationEmailError ||
            data?.isVerified ||
            !isEmailServerConfigured
        ) {
            setShowVerifyEmailModal(false);
        }
    }, [
        sendVerificationEmailError,
        data,
        error,
        showError,
        isEmailServerConfigured,
    ]);

    const handleUpdate = () => {
        if (firstName && lastName && email && validateEmail(email)) {
            mutate({
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
                timeout: 3000,
            });
        }
    };

    return (
        <div
            style={{
                height: 'fit-content',
                display: 'flex',
                flexDirection: 'column',
            }}
        >
            <FormGroup
                label="First name"
                labelFor="first-name-input"
                labelInfo="(required)"
            >
                <InputGroup
                    id="first-name-input"
                    placeholder="First name"
                    type="text"
                    required
                    disabled={isLoading}
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    data-cy="first-name-input"
                />
            </FormGroup>
            <FormGroup
                label="Last name"
                labelFor="last-name-input"
                labelInfo="(required)"
            >
                <InputGroup
                    id="last-name-input"
                    placeholder="Last name"
                    type="text"
                    required
                    disabled={isLoading}
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    data-cy="last-name-input"
                />
            </FormGroup>
            <FormGroup
                label="Email"
                labelFor="email-input"
                labelInfo="(required)"
            >
                <InputGroup
                    id="email-input"
                    placeholder="Email"
                    type="email"
                    required
                    disabled={isLoading}
                    value={email}
                    onChange={(e) => setEmail(e.target.value.trim())}
                    data-cy="email-input"
                    rightElement={
                        isEmailServerConfigured && data?.isVerified ? (
                            <Tooltip2 content="This e-mail has been verified">
                                <Box p={6}>
                                    <Icon
                                        icon="tick-circle"
                                        color={Colors.GREEN4}
                                    />
                                </Box>
                            </Tooltip2>
                        ) : isEmailServerConfigured && !data?.isVerified ? (
                            <Box p={6}>
                                <Icon icon="issue" color={Colors.GRAY3} />
                            </Box>
                        ) : undefined
                    }
                />
                {isEmailServerConfigured && !data?.isVerified ? (
                    <Text color="dimmed" mt="sm">
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
                ) : null}
            </FormGroup>

            <div style={{ flex: 1 }} />

            <Button
                style={{ alignSelf: 'flex-end', marginTop: 20 }}
                intent={Intent.PRIMARY}
                text="Update"
                onClick={handleUpdate}
                loading={isLoading}
                data-cy="update-profile-settings"
            />
            <VerifyEmailModal
                opened={showVerifyEmailModal}
                onClose={() => {
                    setShowVerifyEmailModal(false);
                }}
                isLoading={statusLoading || emailLoading}
            />
        </div>
    );
};

export default ProfilePanel;
