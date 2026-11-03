import { ProjectType } from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Button,
    Group,
    SegmentedControl,
    Select,
    Text,
} from '@mantine/core';
import { useLocalStorage } from '@mantine/hooks';
import {
    IconAdjustmentsHorizontal,
    IconChevronDown,
} from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import { type FC } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useProjects } from '../../hooks/useProjects';
import useLogoutMutation from '../../hooks/user/useUserLogoutMutation';
import useApp from '../../providers/App/useApp';
import MantineIcon from './MantineIcon';
import classes from './OnboardingControlPanel.module.css';
import { ONBOARDING_VARIANTS, useOnboardingVariant } from './onboardingVariant';

const screensFor = (projectUuid: string | null) => [
    { value: '/onboarding/data-source', label: 'Start (Meet Aurora in B)' },
    { value: '/onboarding/data-source?intro=done', label: 'Choose a source' },
    { value: '/onboarding/data-source/postgres', label: 'Warehouse form' },
    ...(projectUuid
        ? [
              ['', 'Tools'],
              ['?step=team', 'Slack and GitHub'],
              ['?step=done', "You're all set"],
          ].map(([query, label]) => ({
              value: `/onboarding/tools/${projectUuid}${query}`,
              label,
          }))
        : []),
    ...(projectUuid
        ? [
              { value: `/projects/${projectUuid}/home`, label: 'Home' },
              { value: `/projects/${projectUuid}/ai-agents`, label: 'Chat' },
          ]
        : []),
];

// Keeps the variant and theme so a fresh run starts in the same comparison
const COLLAPSED_KEY = 'ld.onboarding.controlsCollapsed';
const KEPT_STORAGE_KEYS = [
    'ld.onboarding.variant',
    'color-scheme',
    COLLAPSED_KEY,
];

const clearBrowserState = () => {
    for (const key of Object.keys(localStorage)) {
        if (!KEPT_STORAGE_KEYS.includes(key)) localStorage.removeItem(key);
    }
    sessionStorage.clear();
};

/** Local-only switcher for comparing onboarding variants */
const OnboardingControlPanel: FC = () => {
    const navigate = useNavigate();
    const params = useParams<{ projectUuid?: string }>();
    const { user } = useApp();
    const { data: projects } = useProjects({
        enabled: !!user.data?.organizationUuid,
    });
    const [variant, setVariant] = useOnboardingVariant();
    const [isCollapsed, setIsCollapsed] = useLocalStorage({
        key: COLLAPSED_KEY,
        defaultValue: false,
        getInitialValueInEffect: false,
    });
    const logout = useLogoutMutation({
        onSettled: () => {
            clearBrowserState();
            window.location.assign('/login');
        },
    });
    const reset = useMutation<void, Error>({
        mutationFn: async () => {
            const response = await fetch('/__dev/onboarding-reset', {
                method: 'POST',
            });
            if (!response.ok) throw new Error(await response.text());
        },
        onSuccess: () => logout.mutate(),
    });
    const projectUuid =
        params.projectUuid ??
        projects?.find(({ type }) => type === ProjectType.DEFAULT)
            ?.projectUuid ??
        null;
    if (isCollapsed) {
        return (
            <ActionIcon
                className={classes.collapsed}
                variant="default"
                size="lg"
                radius="xl"
                aria-label="Show onboarding controls"
                onClick={() => setIsCollapsed(false)}
            >
                <MantineIcon icon={IconAdjustmentsHorizontal} />
            </ActionIcon>
        );
    }

    return (
        <Box className={classes.panel}>
            <Group gap="sm" wrap="nowrap">
                <Text fz="xs" c="dimmed">
                    Variant
                </Text>
                <SegmentedControl
                    size="xs"
                    value={variant}
                    onChange={(value) => {
                        const next = ONBOARDING_VARIANTS.find(
                            (option) => option.value === value,
                        );
                        if (next) setVariant(next.value);
                    }}
                    data={ONBOARDING_VARIANTS}
                />
                <Select
                    size="xs"
                    w={200}
                    placeholder="Jump to screen"
                    data={screensFor(projectUuid)}
                    value={null}
                    onChange={(value) => {
                        if (value) void navigate(value);
                    }}
                    comboboxProps={{ position: 'top' }}
                />
                <Button
                    size="xs"
                    variant="default"
                    loading={reset.isLoading || logout.isLoading}
                    onClick={() => reset.mutate()}
                >
                    Start fresh
                </Button>
                <ActionIcon
                    variant="subtle"
                    color="gray"
                    aria-label="Hide onboarding controls"
                    onClick={() => setIsCollapsed(true)}
                >
                    <MantineIcon icon={IconChevronDown} />
                </ActionIcon>
            </Group>
            {reset.error && (
                <Text fz="xs" c="red" mt={4}>
                    {reset.error.message}
                </Text>
            )}
        </Box>
    );
};

export default OnboardingControlPanel;
