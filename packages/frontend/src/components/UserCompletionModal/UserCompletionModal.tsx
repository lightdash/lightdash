import {
    getEmailDomain,
    LightdashMode,
    validateOrganizationEmailDomains,
    type CompleteUserArgs,
} from '@lightdash/common';
import {
    Box,
    Button,
    Checkbox,
    Modal,
    Select,
    Stack,
    Text,
    TextInput,
    Title,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import shuffle from 'lodash/shuffle';
import { useEffect, useMemo, type FC } from 'react';
import { useUserCompleteMutation } from '../../hooks/user/useUserCompleteMutation';
import { useApp } from '../../providers/AppProvider';

const jobTitles = [
    ...shuffle([
        'Data/Analytics Leader (manager, director, etc.)',
        'Data Scientist',
        'Data Analyst',
        'Data Engineer',
        'Analytics Engineer',
        'Software Engineer',
        'Sales',
        'Marketing',
        'Product',
        'Operations',
        'Customer Service',
        'Student',
    ]),
    'Other',
];

const UserCompletionModal: FC = () => {
    const { health, user } = useApp();

    const form = useForm<CompleteUserArgs>({
        initialValues: {
            organizationName: '',
            jobTitle: '',
            enableEmailDomainAccess: false,
            isMarketingOptedIn: true,
            isTrackingAnonymized: false,
        },
    });

    const { isLoading, mutate, isSuccess } = useUserCompleteMutation();

    const handleSubmit = form.onSubmit((data) => {
        if (user.data?.organizationName) {
            const { organizationName, ...rest } = data;
            mutate(rest);
        } else {
            mutate(data);
        }
    });

    const { setFieldValue } = form;

    const isValidOrganizationDomain = useMemo(() => {
        if (!user.data?.email) return false;

        return !validateOrganizationEmailDomains([
            getEmailDomain(user.data.email),
        ]);
    }, [user.data?.email]);

    const canEnterOrganizationName = user.data?.organizationName === '';

    const canEnableEmailDomainAccess =
        canEnterOrganizationName && isValidOrganizationDomain;

    useEffect(() => {
        if (!user.data) return;
        setFieldValue('organizationName', user.data.organizationName);
    }, [setFieldValue, user.data]);

    useEffect(() => {
        if (!canEnableEmailDomainAccess) return;
        setFieldValue('enableEmailDomainAccess', true);
    }, [canEnableEmailDomainAccess, setFieldValue]);

    if (!user.data || user.data.isSetupComplete) {
        return null;
    }

    return (
        <>
            <Modal
                opened={!isSuccess}
                size="md"
                onClose={() => {}}
                withCloseButton={false}
                centered
                title={
                    <Box ta="center">
                        <Title order={4}>Nearly there...</Title>
                        <Text ta="center" c="gray.6">
                            Tell us a bit more about yourself
                        </Text>
                    </Box>
                }
                styles={{
                    title: {
                        width: '100%',
                    },
                }}
            >
                <Stack>
                    <form name="complete_user" onSubmit={handleSubmit}>
                        <Stack>
                            {canEnterOrganizationName && (
                                <TextInput
                                    label="Organization name"
                                    placeholder="Enter company name"
                                    disabled={isLoading}
                                    required
                                    {...form.getInputProps('organizationName')}
                                />
                            )}
                            <Select
                                withinPortal
                                label="What's your role?"
                                disabled={isLoading}
                                data={jobTitles}
                                required
                                placeholder="Select your role"
                                {...form.getInputProps('jobTitle')}
                            />

                            <Stack spacing="xs">
                                {canEnableEmailDomainAccess && (
                                    <Checkbox
                                        label={`Allow users with @${getEmailDomain(
                                            user.data?.email || '',
                                        )} to join the organization as a viewer`}
                                        disabled={isLoading}
                                        {...form.getInputProps(
                                            'enableEmailDomainAccess',
                                            { type: 'checkbox' },
                                        )}
                                    />
                                )}

                                <Checkbox
                                    label="Keep me updated on new Lightdash features"
                                    disabled={isLoading}
                                    {...form.getInputProps(
                                        'isMarketingOptedIn',
                                        {
                                            type: 'checkbox',
                                        },
                                    )}
                                />

                                {health.data?.mode !==
                                    LightdashMode.CLOUD_BETA && (
                                    <Checkbox
                                        label="Anonymize my usage data"
                                        disabled={isLoading}
                                        {...form.getInputProps(
                                            'isTrackingAnonymized',
                                            {
                                                type: 'checkbox',
                                            },
                                        )}
                                    />
                                )}
                            </Stack>
                            <Button
                                size="xs"
                                type="submit"
                                loading={isLoading}
                                disabled={
                                    !(
                                        form.values.organizationName &&
                                        form.values.jobTitle
                                    )
                                }
                            >
                                Next
                            </Button>
                        </Stack>
                    </form>
                </Stack>
            </Modal>
        </>
    );
};

export default UserCompletionModal;
