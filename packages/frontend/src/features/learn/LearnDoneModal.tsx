import { Box, Button, Group, Modal, Stack, Text } from '@mantine/core';
import { type FC, useMemo } from 'react';
import useApp from '../../providers/App/useApp';
import { SCOPE_TOURS } from '../scopeTours/generated';
import { useLearnAvailability } from './availability';
import {
    buildLearnCatalogue,
    focusModules,
    roleFromOrganizationRole,
} from './catalogue';
import styles from './Learn.module.css';
import { useLearnProgress } from './progress';

type Props = {
    /** The module just finished. */
    scope: string;
    /** Return to the library (the copy is put away behind the learner). */
    onBack: () => void;
    /** Go straight into the next module; the library makes the copy. */
    onNext: (scope: string) => void;
};

/**
 * Shown over the page where Got it was pressed, in the learner's copy: the
 * module is named complete, the library's progress line is repeated, and
 * the choice is the module the library would recommend next or the library
 * itself. Nothing changes on the page behind it until one is picked.
 */
export const LearnDoneModal: FC<Props> = ({ scope, onBack, onNext }) => {
    const { user } = useApp();
    const { isOpen } = useLearnAvailability();
    const catalogue = useMemo(
        () => buildLearnCatalogue().filter(isOpen),
        [isOpen],
    );
    const { completed, lastStarted } = useLearnProgress();
    const tour = SCOPE_TOURS[scope];
    const available = catalogue.filter((m) => m.available);
    // The finished module counts as complete here whatever the stored
    // progress says (a reload before it was written), so the count includes
    // it and Next never points back at it.
    const completedHere = completed.includes(scope)
        ? completed
        : [...completed, scope];
    const doneCount = available.filter((m) =>
        completedHere.includes(m.scope),
    ).length;
    const { resume, recommended } = focusModules(
        roleFromOrganizationRole(user.data?.role),
        available,
        completedHere,
        lastStarted,
    );
    const next = recommended ?? resume;

    return (
        <Modal
            opened
            onClose={onBack}
            centered
            size="lg"
            withCloseButton={false}
            closeOnClickOutside={false}
            radius="md"
            padding="xl"
        >
            <Stack gap="lg" data-learn-done={scope}>
                <Box>
                    <span
                        className={`${styles.overline} ${styles.overlineDone}`}
                    >
                        Module complete
                    </span>
                    <Text component="h2" fz="xl" fw={600} mt={4}>
                        {tour?.title ?? scope}
                    </Text>
                    <Text
                        c="dimmed"
                        fz="sm"
                        mt={4}
                        data-learn-progress={`${doneCount}/${available.length}`}
                    >
                        You finished every step. Modules{' '}
                        <b>
                            {doneCount} of {available.length}
                        </b>{' '}
                        complete.
                    </Text>
                </Box>
                {next ? (
                    <Box
                        component="article"
                        className={styles.focusCard}
                        data-learn-next={next.scope}
                    >
                        <span className={styles.overline}>
                            Recommended next
                        </span>
                        <h2>{next.title}</h2>
                        <p>{next.blurb}</p>
                    </Box>
                ) : (
                    <Box
                        component="article"
                        className={styles.focusCard}
                        data-learn-all-done
                    >
                        <span className={styles.overline}>Recommendation</span>
                        <h2>Every module is complete</h2>
                        <p>
                            There is nothing left to recommend. Start any module
                            again from the library.
                        </p>
                    </Box>
                )}
                <Group justify="space-between">
                    <Button
                        variant="subtle"
                        color="gray"
                        onClick={onBack}
                        data-learn-back
                    >
                        Back to library
                    </Button>
                    {next && (
                        <Button
                            variant="filled"
                            color="indigo"
                            onClick={() => onNext(next.scope)}
                        >
                            Next: {next.title}
                        </Button>
                    )}
                </Group>
            </Stack>
        </Modal>
    );
};
