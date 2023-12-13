import {
    CompleteUserArgs,
    getEmailDomain,
    LightdashMode,
    validateOrganizationEmailDomains,
} from '@lightdash/common';
import {
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
import { shuffle } from 'lodash-es';
import { FC, useEffect } from 'react';
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
            enableEmailDomainAccess: true,
            isMarketingOptedIn: true,
            isTrackingAnonymized: false,
        },
    });

    const { isLoading, mutate, isSuccess } = useUserCompleteMutation();

    const handleSubmit = form.onSubmit((data) => mutate(data));

    const { setFieldValue } = form;

    useEffect(() => {
        if (!user.data) return;
        setFieldValue('organizationName', user.data.organizationName);
    }, [setFieldValue, user.data]);

    if (!user.data || user.data.isSetupComplete) {
        return null;
    }

    const isValidOrganizationDomain = !validateOrganizationEmailDomains([
        getEmailDomain(user.data?.email || ''),
    ]);

    return (
        <>
            <Modal
                opened={!isSuccess}
                size="auto"
                onClose={() => {}}
                withCloseButton={false}
                centered
                title={<Title order={4}>Nearly there...</Title>}
                styles={{
                    title: {
                        width: '100%',
                        textAlign: 'center',
                    },
                    header: {
                        padding: '1rem',
                        paddingBottom: '0.75rem',
                    },
                }}
            >
                <Stack>
                    <Text ta="center" c="gray.6">
                        Tell us a bit more about yourself
                    </Text>
                    <form name="complete_user" onSubmit={handleSubmit}>
                        <Stack>
                            {form.values.organizationName === '' && (
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
                                {form.values.organizationName === '' &&
                                    isValidOrganizationDomain && (
                                        <Checkbox
                                            label={`Allow users with @${getEmailDomain(
                                                user.data?.email || '',
                                            )} to join the organization as a viewer`}
                                            disabled={isLoading}
                                            {...form.getInputProps(
                                                'organizationName',
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
