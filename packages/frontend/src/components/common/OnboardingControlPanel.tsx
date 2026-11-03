import { ProjectType } from '@lightdash/common';
import {
    Box,
    Button,
    Group,
    SegmentedControl,
    Select,
    Text,
} from '@mantine/core';
import { useMutation } from '@tanstack/react-query';
import { type FC } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useProjects } from '../../hooks/useProjects';
import useLogoutMutation from '../../hooks/user/useUserLogoutMutation';
import useApp from '../../providers/App/useApp';
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
const KEPT_STORAGE_KEYS = ['ld.onboarding.variant', 'color-scheme'];

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
