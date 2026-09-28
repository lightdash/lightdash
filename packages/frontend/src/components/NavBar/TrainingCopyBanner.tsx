import { Anchor, Center, Group, Text } from '@mantine/core';
import { IconArrowLeft, IconSchool } from '@tabler/icons-react';
import { useCallback, type FC } from 'react';
import {
    learnReturnProjectUuid,
    useLeaveTrainingCopy,
} from '../../features/scopeTours/useLeaveTrainingCopy';
import { useProjects } from '../../hooks/useProjects';
import MantineIcon from '../common/MantineIcon';
import { BANNER_HEIGHT } from '../common/Page/constants';
import classes from './PreviewBanner.module.css';

/**
 * Shown for as long as a learner is in their copy of the training project.
 * A copy outlives the walkthrough that made it: the completion dialog's
 * Keep exploring leaves the learner standing on the chart, dashboard or
 * tree they just built, free to take it apart. That is the moment this
 * banner is for. It says the two things the learner cannot otherwise work
 * out, that nothing here is real and that it will not survive the next
 * module, and it carries the only way back to the library, since the
 * navbar's Learn icon is hidden inside a copy (a library opened there
 * would start walkthroughs from the wrong place).
 */
export const TrainingCopyBanner: FC<{
    /** The training project the copy was made from. */
    trainingProjectUuid: string;
}> = ({ trainingProjectUuid }) => {
    const { data: projects } = useProjects();
    const leaveCopy = useLeaveTrainingCopy();
    const returnProjectUuid = learnReturnProjectUuid(
        projects,
        trainingProjectUuid,
    );

    const handleBackToLearn = useCallback(() => {
        void leaveCopy(
            `/projects/${returnProjectUuid}/learn`,
            trainingProjectUuid,
        );
    }, [leaveCopy, returnProjectUuid, trainingProjectUuid]);

    return (
        <Center
            id="training-copy-banner"
            pos="fixed"
            top={0}
            w="100%"
            h={BANNER_HEIGHT}
            bg="indigo.6"
            className={classes.banner}
            px="md"
        >
            <Group gap="xs" wrap="nowrap" miw={0}>
                <MantineIcon icon={IconSchool} color="white" size="sm" />
                <Text c="white" fw={500} fz="xs" truncate>
                    This is your practice copy of the training project. Nothing
                    here is real, and it resets when you start another module.
                </Text>
                <Anchor
                    component="button"
                    type="button"
                    onClick={handleBackToLearn}
                    c="white"
                    fz="xs"
                    fw={600}
                    underline="always"
                    className={classes.backLink}
                >
                    <MantineIcon icon={IconArrowLeft} size="sm" />
                    <Text span fz="xs" fw={600} truncate>
                        Back to Learn
                    </Text>
                </Anchor>
            </Group>
        </Center>
    );
};
