import {
    CompleteUserSchema,
    FeatureFlags,
    getEmailDomain,
    LightdashMode,
    validateOrganizationEmailDomains,
    type CompleteUserArgs,
} from '@lightdash/common';
import { Button, Checkbox, Select, Stack, TextInput } from '@mantine-8/core';
import { useForm } from '@mantine/form';
import { IconConfetti } from '@tabler/icons-react';
import { zodResolver } from 'mantine-form-zod-resolver';
import { useEffect, useMemo, type FC } from 'react';
import { Navigate, useLocation } from 'react-router';
import { useUserCompleteMutation } from '../../hooks/user/useUserCompleteMutation';
import { useServerFeatureFlag } from '../../hooks/useServerOrClientFeatureFlag';
import useApp from '../../providers/App/useApp';
import MantineModal from '../common/MantineModal';
import { jobTitles } from './jobTitles';

const UserCompletionModal: FC = () => {
    const { health, user } = useApp();

    const canEnterOrganizationName = user.data?.organizationName === '';

    const validate = useMemo(
        () =>
            zodResolver(
                canEnterOrganizationName
                    ? CompleteUserSchema
                    : // User is not creating org, just accepting invite
                      // They cannot input org name so don't validate it for backwards compat reasons
                      CompleteUserSchema.omit({ organizationName: true }),
            ),
        [canEnterOrganizationName],
    );

    const form = useForm<CompleteUserArgs>({
        initialValues: {
            organizationName: '',
            jobTitle: '',
            enableEmailDomainAccess: false,
            isMarketingOptedIn: true,
            isTrackingAnonymized: false,
        },
        validate,
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

    if (
        !user.data ||
        user.data.isSetupComplete ||
        health.data?.rudder.writeKey === undefined
    ) {
        return null;
    }

    return (
        <MantineModal
            opened={!isSuccess}
            size="md"
            onClose={() => {}}
            icon={IconConfetti}
            title="Nearly there..."
            cancelLabel={false}
            withCloseButton={false}
            actions={
                <Button
                    size="xs"
                    type="submit"
                    form="complete_user"
                    loading={isLoading}
                    disabled={
                        !(form.values.organizationName && form.values.jobTitle)
                    }
                >
                    Next
                </Button>
            }
            modalRootProps={{
                closeOnClickOutside: false,
                closeOnEscape: false,
            }}
            description="Tell us a bit more about yourself"
        >
            <form
                id="complete_user"
                name="complete_user"
                onSubmit={handleSubmit}
            >
                <Stack gap="md">
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
                        label="What's your role?"
                        disabled={isLoading}
                        data={jobTitles}
                        required
                        placeholder="Select your role"
                        {...form.getInputProps('jobTitle')}
                    />

                    <Stack gap="xs">
                        {canEnableEmailDomainAccess && (
                            <Checkbox
                                label={`Allow users with @${getEmailDomain(
                                    user.data?.email || '',
                                )} to join the organization as a viewer`}
                                disabled={isLoading}
                                {...form.getInputProps(
                                    'enableEmailDomainAccess',
                                    {
                                        type: 'checkbox',
                                    },
                                )}
                            />
                        )}

                        <Checkbox
                            label="Keep me updated on new Lightdash features"
                            disabled={isLoading}
                            {...form.getInputProps('isMarketingOptedIn', {
                                type: 'checkbox',
                            })}
                        />

                        {health.data?.mode !== LightdashMode.CLOUD_BETA && (
                            <Checkbox
                                label="Anonymize my usage data"
                                disabled={isLoading}
                                {...form.getInputProps('isTrackingAnonymized', {
                                    type: 'checkbox',
                                })}
                            />
                        )}
                    </Stack>
                </Stack>
            </form>
        </MantineModal>
    );
};

const UserCompletionModalWithUser = () => {
    const { user, health } = useApp();
    const location = useLocation();
    const orgSetupPageFlag = useServerFeatureFlag(FeatureFlags.NewOnboarding);

    if (orgSetupPageFlag.isLoading) {
        return null;
    }

    if (orgSetupPageFlag.data?.enabled) {
        const shouldSetup =
            user.data && !user.data.isSetupComplete && health.isSuccess;
        // Keyed by pathname so the redirect re-fires if a competing route
        // redirect (e.g. AppRoute's needsProject -> /createProject) wins the
        // same render commit.
        return shouldSetup ? (
            <Navigate
                key={location.pathname}
                to={
                    location.pathname && location.pathname !== '/'
                        ? `/organization-setup?redirect=${encodeURIComponent(
                              location.pathname,
                          )}`
                        : '/organization-setup'
                }
            />
        ) : null;
    }

    if (!user.isSuccess) {
        return null;
    }

    return <UserCompletionModal />;
};

export default UserCompletionModalWithUser;
