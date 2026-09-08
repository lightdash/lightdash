import { Box, Button, Group, Stack, Text } from '@mantine/core';
import { type FC, useMemo } from 'react';
import MantineModal from '../../components/common/MantineModal';
import useApp from '../../providers/App/useApp';
import { SCOPE_TOURS } from '../scopeTours/generated';
import { useLearnAvailability } from './availability';
import { buildLearnCatalogue, focusModules } from './catalogue';
import styles from './Learn.module.css';
import { useLearnProgress } from './progress';
import { buildRoleViews, defaultRoleView, useLearnRoles } from './roles';

type Props = {
    /** The module just finished. */
    scope: string;
    /** Return to the library (the copy is put away behind the learner). */
    onBack: () => void;
    /** Go straight into the next module, in a fresh copy made from here. */
    onNext: (scope: string) => void;
    /** The next copy is being made; the choice has been taken. */
    opening?: boolean;
};

/**
 * Shown over the page where Got it was pressed, in the learner's copy: the
 * module is named complete, the library's progress line is repeated, and
 * the choice is the module the library would recommend next or the library
 * itself. Nothing changes on the page behind it until one is picked.
 */
export const LearnDoneModal: FC<Props> = ({
    scope,
    onBack,
    onNext,
    opening = false,
}) => {
    const { user } = useApp();
    const { isOpen } = useLearnAvailability();
    const catalogue = useMemo(
        () => buildLearnCatalogue().filter(isOpen),
        [isOpen],
    );
    const { completed, lastStarted } = useLearnProgress();
    // The same view the library opens on, so the two pages never disagree
    // about what comes next for a learner on a custom role.
    const { data: customRoles } = useLearnRoles();
    const roleView = defaultRoleView(
        buildRoleViews(customRoles),
        user.data ?? undefined,
    );
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
        roleView,
        available,
        completedHere,
        lastStarted,
    );
    const next = recommended ?? resume;

    return (
        <MantineModal
            opened
            onClose={onBack}
            title={tour?.title ?? scope}
            subtitle="Module complete"
            size="lg"
            role="alertdialog"
            withCloseButton={false}
            footer={
                <Group justify="space-between" w="100%">
                    <Button
                        variant="subtle"
                        color="gray"
                        onClick={onBack}
                        disabled={opening}
                        data-learn-back
                    >
                        Back to library
                    </Button>
                    {next && (
                        <Button
                            variant="filled"
                            color="indigo"
                            loading={opening}
                            onClick={() => onNext(next.scope)}
                        >
                            Next: {next.title}
                        </Button>
                    )}
                </Group>
            }
        >
            <Stack gap="lg" data-learn-done={scope}>
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
            </Stack>
        </MantineModal>
    );
};
