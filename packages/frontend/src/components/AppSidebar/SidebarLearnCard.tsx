import { ProjectType } from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Progress,
    RingProgress,
    Text,
    Tooltip,
    UnstyledButton,
} from '@mantine/core';
import { useLocalStorage } from '@mantine/hooks';
import { IconArrowRight, IconX } from '@tabler/icons-react';
import { type FC } from 'react';
import { Link, useNavigate } from 'react-router';
import { useLearnUpNext } from '../../features/learn/useLearnUpNext';
import { useStartWalkthrough } from '../../features/learn/useStartWalkthrough';
import { useProject } from '../../hooks/useProject';
import MantineIcon from '../common/MantineIcon';
import classes from './AppSidebar.module.css';

const HIDDEN_STORAGE_KEY = 'app-sidebar:learn-card-hidden';

type Props = {
    projectUuid: string;
    isSidebarCollapsed: boolean;
};

type CardProps = {
    learnUrl: string;
    doneCount: number;
    total: number;
    percentDone: number;
    trainingProjectUuid: string | undefined;
    nextLesson: { scope: string; title: string; isStarted: boolean };
    nextSource: 'recommended' | 'resume';
    onHide: () => void;
};

// Mounted only while the card is on screen: starting a lesson leaves for the
// learner's copy, where the card is gone, so a start never stays pending here.
const LearnCard: FC<CardProps> = ({
    learnUrl,
    doneCount,
    total,
    percentDone,
    trainingProjectUuid,
    nextLesson,
    nextSource,
    onHide,
}) => {
    const navigate = useNavigate();
    const { start, opening } = useStartWalkthrough(trainingProjectUuid);

    return (
        <Box className={classes.learnCard}>
            <Box className={classes.learnHeader}>
                <Text fz="sm" fw={600}>
                    Learn the basics
                </Text>
                <Text fz="xs" c="dimmed" className={classes.learnCount}>
                    {doneCount} of {total}
                </Text>
                <Tooltip label="Hide" position="right">
                    <ActionIcon
                        size="xs"
                        color="gray"
                        aria-label="Hide the Learn card"
                        className={classes.learnHide}
                        onClick={onHide}
                    >
                        <MantineIcon icon={IconX} size={12} />
                    </ActionIcon>
                </Tooltip>
            </Box>
            <Progress
                value={percentDone}
                size={3}
                aria-label={`${doneCount} of ${total} lessons done`}
            />
            <UnstyledButton
                className={classes.learnNext}
                disabled={opening !== null}
                onClick={() => {
                    // Without a training project there is nothing to start
                    // the lesson in; the library is where it gets set up.
                    if (trainingProjectUuid) {
                        start(nextLesson.scope, nextSource);
                    } else {
                        void navigate(learnUrl);
                    }
                }}
            >
                <Text fz="xs" truncate className={classes.learnNextText}>
                    {nextLesson.isStarted ? 'Continue' : 'Next'}:{' '}
                    {nextLesson.title}
                </Text>
                <MantineIcon icon={IconArrowRight} size="sm" />
            </UnstyledButton>
        </Box>
    );
};

/** Keeps unfinished training in sight for someone who has started it. */
export const SidebarLearnCard: FC<Props> = ({
    projectUuid,
    isSidebarCollapsed,
}) => {
    const [isHidden, setIsHidden] = useLocalStorage<boolean>({
        key: HIDDEN_STORAGE_KEY,
        defaultValue: false,
        getInitialValueInEffect: false,
    });
    const { data: project } = useProject(projectUuid);
    const {
        canViewLearn,
        trainingProjectUuid,
        upNext,
        started,
        doneCount,
        total,
        isSettled,
    } = useLearnUpNext();

    const hasStartedTraining = started.length > 0 || doneCount > 0;
    if (
        isHidden ||
        !canViewLearn ||
        !isSettled ||
        !upNext ||
        !hasStartedTraining ||
        // The library is never offered from inside a learner's own copy.
        project?.type === ProjectType.PREVIEW
    ) {
        return null;
    }

    const learnUrl = `/projects/${projectUuid}/learn`;
    const progressLabel = `${doneCount} of ${total} lessons done`;
    const percentDone = total === 0 ? 0 : (doneCount / total) * 100;

    if (isSidebarCollapsed) {
        return (
            <Tooltip label={`Learn: ${progressLabel}`} position="right">
                <UnstyledButton
                    component={Link}
                    to={learnUrl}
                    aria-label={`Learn: ${progressLabel}`}
                    className={classes.learnRing}
                >
                    <RingProgress
                        size={20}
                        thickness={3}
                        rootColor="ldGray.3"
                        sections={[
                            {
                                value: percentDone,
                                color: 'var(--mantine-primary-color-filled)',
                            },
                        ]}
                    />
                </UnstyledButton>
            </Tooltip>
        );
    }

    return (
        <LearnCard
            learnUrl={learnUrl}
            doneCount={doneCount}
            total={total}
            percentDone={percentDone}
            trainingProjectUuid={trainingProjectUuid}
            nextLesson={{
                scope: upNext.module.scope,
                title: upNext.module.title,
                isStarted: upNext.started,
            }}
            nextSource={upNext.source}
            onHide={() => setIsHidden(true)}
        />
    );
};
