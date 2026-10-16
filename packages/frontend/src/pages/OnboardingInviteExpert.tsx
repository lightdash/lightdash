import { subject } from '@casl/ability';
import {
    FeatureFlags,
    getEmailSchema,
    getUserNameSchema,
    InviteLinkPurpose,
    OrganizationMemberRole,
} from '@lightdash/common';
import {
    Alert,
    Box,
    Button,
    Flex,
    Group,
    Loader,
    Paper,
    Stack,
    Text,
    TextInput,
    Title,
} from '@mantine/core';
import { useForm, type UseFormReturnType } from '@mantine/form';
import { captureException } from '@sentry/react';
import {
    IconArrowLeft,
    IconInfoCircle,
    IconUserPlus,
} from '@tabler/icons-react';
import { zod4Resolver as zodResolver } from 'mantine-form-zod-resolver';
import {
    useCallback,
    useEffect,
    useEffectEvent,
    useRef,
    useState,
    type FC,
} from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router';
import { z } from 'zod';
import AboutFooter from '../components/AboutFooter';
import Callout from '../components/common/Callout';
import { DocumentTitle } from '../components/common/DocumentTitle';
import MantineIcon from '../components/common/MantineIcon';
import PageSpinner from '../components/PageSpinner';
import {
    getPlaygroundSetupFailure,
    isRetryablePlaygroundSetupFailure,
    PLAYGROUND_SETUP_FAILURE_MESSAGES,
    type PlaygroundSetupFailure,
} from '../components/ProjectConnection/ProjectConnectFlow/playgroundSetupFailure';
import { useOrganization } from '../hooks/organization/useOrganization';
import { useEnsurePlaygroundProject } from '../hooks/useEnsurePlaygroundProject';
import { useCreateInviteLinkMutation } from '../hooks/useInviteLink';
import { useUserUpdateMutation } from '../hooks/user/useUserUpdateMutation';
import { useServerFeatureFlag } from '../hooks/useServerOrClientFeatureFlag';
import useApp from '../providers/App/useApp';
import useTracking from '../providers/Tracking/useTracking';
import { EventName } from '../types/Events';
import classes from './OnboardingInviteExpert.module.css';

type SetupInviteFormValues = {
    firstName: string;
    lastName: string;
    email: string;
};

const PreparingPlaygroundCard: FC = () => {
    const { t } = useTranslation('pages');
    return (
        <Group gap="md" wrap="nowrap">
            <Loader size="sm" />
            <Stack gap={2}>
                <Text size="sm" fw={500}>
                    {t('onboardingInviteExpert.preparingPlayground')}
                </Text>
                <Text size="sm" c="dimmed">
                    {t('onboardingInviteExpert.preparingPlaygroundDescription')}
                </Text>
            </Stack>
        </Group>
    );
};

const PlaygroundFailureCard: FC<{
    failure: PlaygroundSetupFailure;
    onRetry: () => void;
    onClose: () => void;
}> = ({ failure, onRetry, onClose }) => {
    const { t } = useTranslation('pages');
    return (
        <Stack gap="md">
            <Callout
                variant="warning"
                title={t('onboardingInviteExpert.playgroundFailed')}
            >
                <Text size="sm">
                    {PLAYGROUND_SETUP_FAILURE_MESSAGES[failure]}
                </Text>
            </Callout>
            <Group justify="flex-end" gap="xs">
                {isRetryablePlaygroundSetupFailure(failure) && (
                    <Button variant="default" onClick={onRetry}>
                        {t('onboardingInviteExpert.tryAgain')}
                    </Button>
                )}
                <Button onClick={onClose}>
                    {t('onboardingInviteExpert.done')}
                </Button>
            </Group>
        </Stack>
    );
};

const InviteExpertForm: FC<{
    form: UseFormReturnType<SetupInviteFormValues>;
    needsName: boolean;
    isSubmitting: boolean;
    onSubmit: (values: SetupInviteFormValues) => Promise<void>;
    onCancel: () => void;
}> = ({ form, needsName, isSubmitting, onSubmit, onCancel }) => {
    const { t } = useTranslation('pages');
    return (
        <form
            id="setup_invite"
            name="setup_invite"
            onSubmit={form.onSubmit((values) => onSubmit(values))}
        >
            <Stack gap="sm">
                {needsName && (
                    <>
                        <Flex
                            direction={{ base: 'column', sm: 'row' }}
                            gap="sm"
                        >
                            <TextInput
                                name="firstName"
                                autoComplete="given-name"
                                flex={1}
                                label={t('onboardingInviteExpert.firstName')}
                                required
                                disabled={isSubmitting}
                                {...form.getInputProps('firstName')}
                            />
                            <TextInput
                                name="lastName"
                                autoComplete="family-name"
                                flex={1}
                                label={t('onboardingInviteExpert.lastName')}
                                required
                                disabled={isSubmitting}
                                {...form.getInputProps('lastName')}
                            />
                        </Flex>
                        <Text size="sm" c="dimmed">
                            {t('onboardingInviteExpert.nameHint')}
                        </Text>
                    </>
                )}
                <TextInput
                    name="email"
                    type="email"
                    label={t('onboardingInviteExpert.email')}
                    placeholder={t('onboardingInviteExpert.emailPlaceholder')}
                    required
                    disabled={isSubmitting}
                    {...form.getInputProps('email')}
                />
                <Text size="sm" c="dimmed">
                    {t('onboardingInviteExpert.emailHint')}
                </Text>
                <Group justify="flex-end" mt="sm">
                    <Button
                        variant="default"
                        onClick={onCancel}
                        disabled={isSubmitting}
                    >
                        {t('actions.cancel', { ns: 'common' })}
                    </Button>
                    <Button
                        loading={isSubmitting}
                        type="submit"
                        form="setup_invite"
                    >
                        {t('onboardingInviteExpert.sendInvite')}
                    </Button>
                </Group>
            </Stack>
        </form>
    );
};

const OnboardingInviteExpert: FC = () => {
    const { t } = useTranslation('pages');
    const { health, user } = useApp();
    const existingFirstName = user.data?.firstName ?? '';
    const existingLastName = user.data?.lastName ?? '';
    const needsName = !existingFirstName.trim() || !existingLastName.trim();

    const form = useForm<SetupInviteFormValues>({
        initialValues: {
            firstName: existingFirstName,
            lastName: existingLastName,
            email: '',
        },
        validate: zodResolver(
            z.object({
                firstName: needsName ? getUserNameSchema() : z.string(),
                lastName: needsName ? getUserNameSchema() : z.string(),
                email: getEmailSchema(),
            }),
        ),
    });
    const {
        data: inviteLink,
        mutateAsync,
        isLoading,
    } = useCreateInviteLinkMutation({ showSuccessToast: false });
    const { mutateAsync: updateUserAsync, isLoading: isUpdatingUser } =
        useUserUpdateMutation();
    const { track } = useTracking();
    const navigate = useNavigate();
    const location = useLocation();
    const rawReturnTo = (location.state as { returnTo?: string } | null)
        ?.returnTo;
    // Only accept app-local paths; anything else (e.g. "//host") would make
    // pushState throw.
    const returnTo =
        rawReturnTo && /^\/(?![/\\])/.test(rawReturnTo)
            ? rawReturnTo
            : undefined;

    const newOnboardingFlag = useServerFeatureFlag(FeatureFlags.NewOnboarding);
    const isNewOnboarding = newOnboardingFlag.data?.enabled ?? false;
    const { data: organization } = useOrganization();
    const [playgroundFailure, setPlaygroundFailure] =
        useState<PlaygroundSetupFailure | null>(null);
    const {
        mutateAsync: ensurePlaygroundAsync,
        isLoading: isPreparingPlayground,
    } = useEnsurePlaygroundProject();

    // The flag says the flow exists, not that a playground can be provisioned:
    // the instance must support it and the org must not already have a project
    const canOfferPlayground =
        isNewOnboarding &&
        health.data?.hasPlaygroundProjects === true &&
        organization?.needsProject === true;

    const titleRef = useRef<HTMLHeadingElement>(null);
    const hasFocusedTitleRef = useRef(false);

    const handleClose = useCallback(() => {
        if (returnTo) {
            void navigate(returnTo, { replace: true });
        } else if (
            typeof window !== 'undefined' &&
            (window.history.state?.idx ?? 0) > 0
        ) {
            void navigate(-1);
        } else {
            void navigate(
                isNewOnboarding ? '/onboarding/data-source' : '/createProject',
                { replace: true },
            );
        }
    }, [returnTo, isNewOnboarding, navigate]);

    // Route-change focus management (the modal used to trap focus): move
    // focus to the page heading once it renders, and keep Escape-to-leave.
    const isBooting = user.isInitialLoading || newOnboardingFlag.isLoading;

    useEffect(() => {
        if (isBooting || hasFocusedTitleRef.current) return;
        const title = titleRef.current;
        if (!title) return;
        hasFocusedTitleRef.current = true;
        title.focus({ preventScroll: true });
    }, [isBooting]);

    const closeOnEscape = useEffectEvent(handleClose);

    useEffect(() => {
        if (isBooting) return undefined;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;
            // Don't hijack Escape from autofill dropdowns, IME composition,
            // or text inputs — it belongs to them first.
            if (event.defaultPrevented || event.isComposing) return;
            if (
                document.activeElement instanceof HTMLInputElement ||
                document.activeElement instanceof HTMLTextAreaElement
            ) {
                return;
            }
            closeOnEscape();
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [isBooting]);

    const preparePlayground = async () => {
        try {
            const { projectUuid } = await ensurePlaygroundAsync({
                trigger: 'invite_expert',
            });
            track({
                name: EventName.PLAYGROUND_PROJECT_ENTERED,
                properties: {
                    organizationId: organization?.organizationUuid ?? '',
                },
            });
            void navigate(`/projects/${projectUuid}/home`);
        } catch (error) {
            const failureType = getPlaygroundSetupFailure(error);
            setPlaygroundFailure(failureType);
            track({
                name: EventName.PLAYGROUND_PROJECT_SETUP_FAILED,
                properties: {
                    organizationId: organization?.organizationUuid ?? '',
                    failureType,
                },
            });
            captureException(error, {
                tags: { feature: 'playground-onboarding' },
            });
        }
    };

    const handleSubmit = async (values: SetupInviteFormValues) => {
        if (needsName) {
            await updateUserAsync({
                firstName: values.firstName.trim(),
                lastName: values.lastName.trim(),
            });
        }
        await mutateAsync({
            email: values.email,
            role: OrganizationMemberRole.ADMIN,
            purpose: InviteLinkPurpose.Setup,
        });
        track({
            name: EventName.SETUP_INVITE_SENT,
            properties: {
                organizationId: organization?.organizationUuid ?? '',
            },
        });

        if (canOfferPlayground) {
            await preparePlayground();
        } else {
            handleClose();
        }
    };

    const isSubmitting = isLoading || isUpdatingUser;

    const isEnteringPlayground =
        canOfferPlayground && !playgroundFailure && inviteLink !== undefined;

    if (isBooting) {
        return <PageSpinner />;
    }

    // The CTA entry points gate on this ability; mirror it here so
    // deep-linking viewers get an explanation instead of a raw 403.
    const canInviteUsers =
        user.data?.ability?.can(
            'manage',
            subject('OrganizationMemberProfile', {
                organizationUuid: user.data?.organizationUuid,
            }),
        ) ?? false;

    const fallbackTarget = isNewOnboarding
        ? '/onboarding/data-source'
        : '/createProject';
    const backLabel = (returnTo ?? fallbackTarget).startsWith('/createProject')
        ? t('onboardingInviteExpert.backToProjectSetup')
        : t('onboardingInviteExpert.backToDataSources');

    // Fail closed: a user query that errored leaves no ability to read, and
    // submitting would only produce a raw 403.
    if (!canInviteUsers) {
        return (
            <Box className={classes.page}>
                <DocumentTitle
                    title={t('onboardingInviteExpert.documentTitle')}
                />
                <Box className={classes.column}>
                    <Stack align="center" gap="md" maw={420} mx="auto">
                        <Title
                            order={1}
                            ta="center"
                            ref={titleRef}
                            tabIndex={-1}
                            className={classes.title}
                        >
                            {t('onboardingInviteExpert.title')}
                        </Title>
                        <Alert
                            icon={<IconInfoCircle />}
                            color="yellow"
                            title={t('onboardingInviteExpert.noPermission')}
                        >
                            {t('onboardingInviteExpert.askAdmin')}
                        </Alert>
                        <Button variant="default" onClick={handleClose}>
                            {backLabel}
                        </Button>
                    </Stack>
                </Box>
                <AboutFooter />
            </Box>
        );
    }

    return (
        <Box className={classes.page}>
            <DocumentTitle title={t('onboardingInviteExpert.documentTitle')} />
            <Box className={classes.column}>
                <Stack align="center" gap="xs">
                    <MantineIcon icon={IconUserPlus} size="xl" color="dimmed" />
                    <Title
                        order={1}
                        ta="center"
                        ref={titleRef}
                        tabIndex={-1}
                        className={classes.title}
                    >
                        {t('onboardingInviteExpert.title')}
                    </Title>
                    <Text size="md" c="dimmed" ta="center">
                        {t('onboardingInviteExpert.subtitle')}
                    </Text>
                </Stack>

                <Paper radius="md" className={classes.card}>
                    {isPreparingPlayground || isEnteringPlayground ? (
                        <PreparingPlaygroundCard />
                    ) : playgroundFailure ? (
                        <PlaygroundFailureCard
                            failure={playgroundFailure}
                            onRetry={() => {
                                setPlaygroundFailure(null);
                                void preparePlayground();
                            }}
                            onClose={handleClose}
                        />
                    ) : (
                        <InviteExpertForm
                            form={form}
                            needsName={needsName}
                            isSubmitting={isSubmitting}
                            onSubmit={handleSubmit}
                            onCancel={handleClose}
                        />
                    )}
                </Paper>

                <Button
                    variant="subtle"
                    color="ldGray"
                    size="sm"
                    leftSection={<MantineIcon icon={IconArrowLeft} />}
                    onClick={handleClose}
                    mx="auto"
                >
                    {backLabel}
                </Button>
            </Box>
            <AboutFooter />
        </Box>
    );
};

export default OnboardingInviteExpert;
