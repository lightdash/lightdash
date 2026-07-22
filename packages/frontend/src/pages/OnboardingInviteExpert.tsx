import { subject } from '@casl/ability';
import {
    FeatureFlags,
    getEmailSchema,
    InviteLinkPurpose,
    OrganizationMemberRole,
} from '@lightdash/common';
import {
    ActionIcon,
    Alert,
    Box,
    Button,
    CopyButton,
    Group,
    Loader,
    Paper,
    Stack,
    Text,
    TextInput,
    Title,
    Tooltip,
} from '@mantine-8/core';
import { useForm, zodResolver } from '@mantine/form';
import { captureException } from '@sentry/react';
import {
    IconArrowLeft,
    IconCheck,
    IconCopy,
    IconInfoCircle,
    IconUserPlus,
} from '@tabler/icons-react';
import { useCallback, useEffect, useRef, useState, type FC } from 'react';
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

const OnboardingInviteExpert: FC = () => {
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
                firstName: needsName
                    ? z.string().trim().min(1, 'Required')
                    : z.string(),
                lastName: needsName
                    ? z.string().trim().min(1, 'Required')
                    : z.string(),
                email: getEmailSchema(),
            }),
        ),
    });
    const {
        data: inviteLink,
        mutateAsync,
        isLoading,
    } = useCreateInviteLinkMutation();
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
        rawReturnTo && /^\/(?!\/)/.test(rawReturnTo) ? rawReturnTo : undefined;

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
            handleClose();
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [handleClose, isBooting]);

    const preparePlayground = async () => {
        try {
            const { projectUuid } = await ensurePlaygroundAsync();
            track({ name: EventName.PLAYGROUND_PROJECT_ENTERED });
            void navigate(`/projects/${projectUuid}/home`);
        } catch (error) {
            setPlaygroundFailure(getPlaygroundSetupFailure(error));
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
            properties: { organizationId: organization?.organizationUuid ?? '' },
        });

        if (canOfferPlayground) {
            await preparePlayground();
        }
    };

    const isSubmitting = isLoading || isUpdatingUser;

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
        ? 'Back to project setup'
        : 'Back to data sources';

    // Fail closed: a user query that errored leaves no ability to read, and
    // submitting would only produce a raw 403.
    if (!canInviteUsers) {
        return (
            <Box className={classes.page}>
                <DocumentTitle title="Invite an expert" />
                <Box className={classes.column}>
                    <Stack align="center" gap="md" maw={420} mx="auto">
                        <Title
                            order={1}
                            ta="center"
                            fw={700}
                            ref={titleRef}
                            tabIndex={-1}
                            className={classes.title}
                        >
                            Invite someone to set this up
                        </Title>
                        <Alert
                            icon={<IconInfoCircle />}
                            color="yellow"
                            title="You don't have permission to invite people"
                        >
                            Ask an admin of this organization to send the invite
                            instead.
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
            <DocumentTitle title="Invite an expert" />
            <Box className={classes.column}>
                <Stack align="center" gap="xs">
                    <MantineIcon
                        icon={IconUserPlus}
                        size="xl"
                        color="ldGray.6"
                    />
                    <Title
                        order={1}
                        ta="center"
                        fw={700}
                        ref={titleRef}
                        tabIndex={-1}
                        className={classes.title}
                    >
                        Invite someone to set this up
                    </Title>
                    <Text size="md" c="dimmed" ta="center">
                        Connecting the warehouse is usually a data-team job —
                        we'll take them straight to warehouse setup.
                    </Text>
                </Stack>

                <Paper
                    withBorder
                    shadow="subtle"
                    radius="md"
                    className={classes.card}
                >
                    {isPreparingPlayground ? (
                        <Group gap="md" wrap="nowrap">
                            <Loader size="sm" />
                            <Stack gap={2}>
                                <Text size="sm" fw={500}>
                                    Preparing your playground…
                                </Text>
                                <Text size="sm" c="dimmed">
                                    Explore sample data while your expert
                                    connects your warehouse.
                                </Text>
                            </Stack>
                        </Group>
                    ) : inviteLink ? (
                        <Stack gap="md">
                            {playgroundFailure && (
                                <Callout
                                    variant="warning"
                                    title="We couldn't set up a sample project"
                                >
                                    <Text size="sm">
                                        {
                                            PLAYGROUND_SETUP_FAILURE_MESSAGES[
                                                playgroundFailure
                                            ]
                                        }
                                    </Text>
                                </Callout>
                            )}
                            <Alert
                                icon={<IconCheck />}
                                color="green"
                                title="Invite ready"
                            >
                                <Stack gap="sm">
                                    <Text size="sm">
                                        {health.data?.hasEmailClient ? (
                                            <>
                                                Invite sent to{' '}
                                                <b>{inviteLink.email}</b> —
                                                we'll take them straight to
                                                warehouse setup.
                                            </>
                                        ) : (
                                            <>
                                                Share this link with{' '}
                                                <b>{inviteLink.email}</b> to
                                                take them straight to warehouse
                                                setup.
                                            </>
                                        )}
                                    </Text>
                                    <TextInput
                                        readOnly
                                        className="sentry-block ph-no-capture"
                                        value={inviteLink.inviteUrl}
                                        rightSection={
                                            <CopyButton
                                                value={inviteLink.inviteUrl}
                                            >
                                                {({ copied, copy }) => (
                                                    <Tooltip
                                                        label={
                                                            copied
                                                                ? 'Copied'
                                                                : 'Copy'
                                                        }
                                                        withArrow
                                                        position="right"
                                                    >
                                                        <ActionIcon
                                                            color={
                                                                copied
                                                                    ? 'teal'
                                                                    : 'gray'
                                                            }
                                                            onClick={copy}
                                                        >
                                                            <MantineIcon
                                                                icon={
                                                                    copied
                                                                        ? IconCheck
                                                                        : IconCopy
                                                                }
                                                            />
                                                        </ActionIcon>
                                                    </Tooltip>
                                                )}
                                            </CopyButton>
                                        }
                                    />
                                </Stack>
                            </Alert>
                            <Group justify="flex-end" gap="xs">
                                {playgroundFailure &&
                                    isRetryablePlaygroundSetupFailure(
                                        playgroundFailure,
                                    ) && (
                                        <Button
                                            variant="default"
                                            onClick={() => {
                                                setPlaygroundFailure(null);
                                                void preparePlayground();
                                            }}
                                        >
                                            Try again
                                        </Button>
                                    )}
                                <Button onClick={handleClose}>Done</Button>
                            </Group>
                        </Stack>
                    ) : (
                        <form
                            id="setup_invite"
                            name="setup_invite"
                            onSubmit={form.onSubmit((values) =>
                                handleSubmit(values),
                            )}
                        >
                            <Stack gap="sm">
                                {needsName && (
                                    <>
                                        <Group grow gap="sm">
                                            <TextInput
                                                name="firstName"
                                                label="Your first name"
                                                required
                                                disabled={isSubmitting}
                                                {...form.getInputProps(
                                                    'firstName',
                                                )}
                                            />
                                            <TextInput
                                                name="lastName"
                                                label="Your last name"
                                                required
                                                disabled={isSubmitting}
                                                {...form.getInputProps(
                                                    'lastName',
                                                )}
                                            />
                                        </Group>
                                        <Text size="sm" c="dimmed">
                                            We'll include your name in the
                                            invite so they know who's asking.
                                        </Text>
                                    </>
                                )}
                                <TextInput
                                    name="email"
                                    label="Their email address"
                                    placeholder="example@company.com"
                                    required
                                    disabled={isSubmitting}
                                    {...form.getInputProps('email')}
                                />
                                <Text size="sm" c="dimmed">
                                    We'll ask them to connect your data
                                    warehouse.
                                </Text>
                                <Group justify="flex-end" mt="sm">
                                    <Button
                                        variant="default"
                                        onClick={handleClose}
                                        disabled={isSubmitting}
                                    >
                                        Cancel
                                    </Button>
                                    <Button
                                        loading={isSubmitting}
                                        type="submit"
                                        form="setup_invite"
                                    >
                                        Send invite
                                    </Button>
                                </Group>
                            </Stack>
                        </form>
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
