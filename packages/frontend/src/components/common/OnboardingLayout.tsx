import { Box, Button, Group, Paper, Text } from '@mantine/core';
import { useQueryClient } from '@tanstack/react-query';
import {
    useEffect,
    useLayoutEffect,
    useState,
    type FC,
    type PropsWithChildren,
    type ReactNode,
} from 'react';
import { useNavigate } from 'react-router';
import useLogoutMutation from '../../hooks/user/useUserLogoutMutation';
import useApp from '../../providers/App/useApp';
import { type OnboardingScreen } from '../../providers/Tracking/types';
import LightdashWordmark from './AuthLayout/LightdashWordmark';
import OnboardingControlPanel from './OnboardingControlPanel';
import classes from './OnboardingLayout.module.css';
import { StepVisual } from './OnboardingVisuals';
import { PixelField } from './PixelField';
import { useTrackOnboardingScreen } from './useTrackOnboardingScreen';

const SwitchAccountButton: FC = () => {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const { user } = useApp();
    const email = user.data?.email ?? null;
    const logout = useLogoutMutation({
        onSuccess: () => {
            queryClient.clear();
            void navigate('/login', { replace: true });
        },
    });
    return (
        <Group gap={4} wrap="nowrap" className={classes.account}>
            {email && (
                <Text fz="xs" c="dimmed" truncate>
                    {email}
                </Text>
            )}
            <Button
                variant="subtle"
                color="gray"
                size="compact-xs"
                fw={400}
                loading={logout.isLoading}
                onClick={() => logout.mutate()}
            >
                Switch account
            </Button>
        </Group>
    );
};

type Steps = { currentStep: number; steps: string[] };

const JourneySteps: FC<Steps> = ({ currentStep, steps }) => (
    <Box
        component="ol"
        className={classes.journeyBar}
        aria-label={`Step ${currentStep} of ${steps.length}: ${steps[currentStep - 1]}`}
    >
        {steps.map((label, index) => (
            <Box
                component="li"
                key={label}
                className={classes.journeySegment}
                data-state={
                    index + 1 < currentStep
                        ? 'done'
                        : index + 1 === currentStep
                          ? 'current'
                          : 'todo'
                }
            />
        ))}
    </Box>
);

// Each step page mounts its own layout, so the last depth outlives them to pick a direction
let lastStackDepth = 0;

const useStackDirection = (stackDepth: number) => {
    const [direction] = useState(() =>
        stackDepth > lastStackDepth
            ? 'forward'
            : stackDepth < lastStackDepth
              ? 'back'
              : 'none',
    );
    // View transition pseudo-elements live on the root, so the direction goes there
    useLayoutEffect(() => {
        document.documentElement.dataset.onboardingDirection = direction;
    }, [direction]);
    useEffect(() => {
        lastStackDepth = stackDepth;
    }, [stackDepth]);
};

type Props = PropsWithChildren<{
    screen?: OnboardingScreen | null;
    size?: 'standard' | 'wide';
    withAccountSwitch?: boolean;
    progress?: Steps | null;
    journey?: Steps | null;
    cardId?: string;
    aside?: ReactNode;
    stackDepth?: number;
    celebrate?: boolean;
    centered?: boolean;
    /** Background work that should stay visible next to the step */
    activity?: ReactNode;
}>;

const OnboardingLayout: FC<Props> = ({
    children,
    screen = null,
    size = 'standard',
    withAccountSwitch = true,
    progress = null,
    journey = null,
    cardId,
    aside: asideProp = null,
    stackDepth = 0,
    celebrate = false,
    centered = false,
    activity = null,
}) => {
    useStackDirection(stackDepth);
    useTrackOnboardingScreen(screen);
    const aside =
        asideProp ?? (centered ? null : <StepVisual step="welcome" />);
    const controlPanel = import.meta.env.DEV && <OnboardingControlPanel />;

    if (!centered) {
        return (
            <Box component="main" className={classes.splitRoot}>
                <Box className={classes.splitForm} data-onboarding-card>
                    <Box id={cardId} className={classes.splitContent}>
                        <Group
                            justify="space-between"
                            wrap="nowrap"
                            className={classes.splitHeader}
                        >
                            <LightdashWordmark className={classes.wordmark} />
                            {withAccountSwitch && <SwitchAccountButton />}
                        </Group>
                        {journey && <JourneySteps {...journey} />}
                        <Box className={classes.splitBody}>{children}</Box>
                    </Box>
                </Box>
                <Box className={classes.splitVisual}>
                    <PixelField celebrate={celebrate} />
                    <Box className={classes.splitVisualInner}>{aside}</Box>
                </Box>
                {activity && (
                    <Box className={classes.activityToast}>{activity}</Box>
                )}
                {controlPanel}
            </Box>
        );
    }

    return (
        <Box component="main" className={classes.page}>
            <Box
                className={classes.content}
                data-size={aside ? 'split' : size}
                data-journey={journey !== null}
            >
                {journey && <JourneySteps {...journey} />}
                <Box
                    key={stackDepth}
                    className={classes.stack}
                    data-depth={Math.min(stackDepth, 1)}
                >
                    {stackDepth >= 1 && (
                        <Box className={classes.ghost} aria-hidden />
                    )}
                    <Paper
                        id={cardId}
                        className={classes.card}
                        data-onboarding-card
                        data-split={!!aside}
                    >
                        <Box className={classes.main}>
                            <Box
                                className={classes.header}
                                data-with-progress={progress !== null}
                            >
                                <LightdashWordmark
                                    className={classes.wordmark}
                                />
                                {progress && (
                                    <Box
                                        component="ol"
                                        className={classes.progress}
                                        aria-label="Setup progress"
                                    >
                                        {progress.steps.map((label, index) => (
                                            <Box
                                                component="li"
                                                key={label}
                                                className={classes.indicator}
                                                aria-current={
                                                    index + 1 ===
                                                    progress.currentStep
                                                        ? 'step'
                                                        : undefined
                                                }
                                                aria-label={`${label}, step ${index + 1} of ${progress.steps.length}`}
                                            />
                                        ))}
                                    </Box>
                                )}
                            </Box>
                            {children}
                        </Box>
                        {aside && (
                            <Box className={classes.aside}>
                                <PixelField celebrate={celebrate} />
                                <Box className={classes.asideInner}>
                                    {aside}
                                </Box>
                            </Box>
                        )}
                    </Paper>
                </Box>
                {withAccountSwitch && (
                    <Box className={classes.accountSwitch}>
                        <SwitchAccountButton />
                    </Box>
                )}
            </Box>
            {activity && (
                <Box className={classes.activityToast}>{activity}</Box>
            )}
            {controlPanel}
        </Box>
    );
};

export default OnboardingLayout;
