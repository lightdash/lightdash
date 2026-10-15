import {
    CompleteUserSchema,
    FeatureFlags,
    getEmailDomain,
    LightdashMode,
    validateOrganizationEmailDomains,
    type CompleteUserArgs,
} from '@lightdash/common';
import { Button, Checkbox, Select, Stack, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconConfetti } from '@tabler/icons-react';
import { useIsMutating } from '@tanstack/react-query';
import { zod4Resolver as zodResolver } from 'mantine-form-zod-resolver';
import { type FC, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useLocation } from 'react-router';
import { useUserCompleteMutation } from '../../hooks/user/useUserCompleteMutation';
import { useServerFeatureFlag } from '../../hooks/useServerOrClientFeatureFlag';
import useApp from '../../providers/App/useApp';
import MantineModal from '../common/MantineModal';
import { getJobTitleOptions } from './jobTitles';

const UserCompletionModal: FC = () => {
    const { t } = useTranslation('app');
    const jobTitleOptions = useMemo(() => getJobTitleOptions(t), [t]);
    const { health, user } = useApp();

    const canEnterOrganizationName = user.data?.organizationName === '';

    const validate = useMemo(
        () =>
            zodResolver(
                canEnterOrganizationName
                    ? CompleteUserSchema
                    : // User is not creating org, just accepting invite: they
                      // cannot input org name (backwards compat) and we only
                      // ask the org creator how they heard about us.
                      CompleteUserSchema.omit({
                          organizationName: true,
                          howDidYouHearAboutUs: true,
                      }),
            ),
        [canEnterOrganizationName],
    );

    const form = useForm<CompleteUserArgs>({
        initialValues: {
            organizationName: '',
            jobTitle: '',
            howDidYouHearAboutUs: '',
            enableEmailDomainAccess: false,
            isMarketingOptedIn: true,
            isTrackingAnonymized: false,
        },
        validate,
    });

    const { isLoading, mutate, isSuccess } = useUserCompleteMutation();

    const handleSubmit = form.onSubmit((data) => {
        // Only the org creator answers "how did you hear about us?"; drop it
        // for invited members so we don't collect (or track) their answer.
        const howDidYouHearAboutUs = canEnterOrganizationName
            ? data.howDidYouHearAboutUs?.trim() || undefined
            : undefined;
        const payload = { ...data, howDidYouHearAboutUs };
        if (user.data?.organizationName) {
            const { organizationName, ...rest } = payload;
            mutate(rest);
        } else {
            mutate(payload);
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
            title={t('userCompletion.title')}
            cancelLabel={false}
            withCloseButton={false}
            actions={
                <Button
                    size="xs"
                    type="submit"
                    form="complete_user"
                    loading={isLoading}
                    disabled={
                        !(
                            form.values.organizationName &&
                            form.values.jobTitle &&
                            (!canEnterOrganizationName ||
                                form.values.howDidYouHearAboutUs?.trim())
                        )
                    }
                >
                    {t('actions.next', { ns: 'common' })}
                </Button>
            }
            modalRootProps={{
                closeOnClickOutside: false,
                closeOnEscape: false,
            }}
            description={t('userCompletion.description')}
        >
            <form
                id="complete_user"
                name="complete_user"
                onSubmit={handleSubmit}
            >
                <Stack gap="md">
                    {canEnterOrganizationName && (
                        <TextInput
                            label={t('userCompletion.organizationName')}
                            placeholder={t(
                                'userCompletion.organizationNamePlaceholder',
                            )}
                            disabled={isLoading}
                            required
                            {...form.getInputProps('organizationName')}
                        />
                    )}
                    <Select
                        label={t('userCompletion.role')}
                        disabled={isLoading}
                        data={jobTitleOptions}
                        required
                        placeholder={t('userCompletion.rolePlaceholder')}
                        {...form.getInputProps('jobTitle')}
                    />

                    {canEnterOrganizationName && (
                        <TextInput
                            label={t('userCompletion.howDidYouHear')}
                            placeholder={t(
                                'userCompletion.howDidYouHearPlaceholder',
                            )}
                            disabled={isLoading}
                            required
                            {...form.getInputProps('howDidYouHearAboutUs')}
                        />
                    )}

                    <Stack gap="xs">
                        {canEnableEmailDomainAccess && (
                            <Checkbox
                                label={t('userCompletion.allowDomain', {
                                    domain: getEmailDomain(
                                        user.data?.email || '',
                                    ),
                                })}
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
                            label={t('userCompletion.marketingOptIn')}
                            disabled={isLoading}
                            {...form.getInputProps('isMarketingOptedIn', {
                                type: 'checkbox',
                            })}
                        />

                        {health.data?.mode !== LightdashMode.CLOUD_BETA && (
                            <Checkbox
                                label={t('userCompletion.anonymize')}
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
    const isCompletingUser =
        useIsMutating({ mutationKey: ['user_complete'] }) > 0;
    const [hasCompletedSetup, setHasCompletedSetup] = useState(
        user.data?.isSetupComplete === true,
    );

    if (user.data?.isSetupComplete && !hasCompletedSetup) {
        setHasCompletedSetup(true);
    }

    if (orgSetupPageFlag.isLoading) {
        return null;
    }

    if (orgSetupPageFlag.data?.enabled) {
        const shouldSetup =
            user.data &&
            !user.data.isSetupComplete &&
            health.isSuccess &&
            !isCompletingUser &&
            !hasCompletedSetup;
        return shouldSetup ? (
            <Navigate
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
