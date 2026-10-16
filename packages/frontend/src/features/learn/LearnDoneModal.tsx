import { Box, Button, Group, Stack, Text } from '@mantine/core';
import { type FC, useMemo } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import MantineModal from '../../components/common/MantineModal';
import { lessonScopesFor, tourFor } from '../scopeTours/tourFor';
import { useLearnAvailability } from './availability';
import { buildLearnCatalogue, focusModules, isComplete } from './catalogue';
import styles from './Learn.module.css';
import { useLearnProgress } from './progress';
import { useLearnAccess } from './useLearnAccess';

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
    const { t } = useTranslation('learn');
    const { isOpen } = useLearnAvailability();
    const catalogue = useMemo(
        () => buildLearnCatalogue().filter(isOpen),
        [isOpen],
    );
    const { completed, lastStarted } = useLearnProgress();
    // The same access the library reads, so the two pages never disagree
    // about what comes next.
    const { held } = useLearnAccess();
    const tour = tourFor(scope);
    const available = catalogue.filter((m) => m.available);
    // The finished module counts as complete here whatever the stored
    // progress says (a reload before it was written), so the count includes
    // it and Next never points back at it. A lesson stands for every scope
    // it covers, so all of them count.
    const completedHere = lessonScopesFor(scope).reduce(
        (list, each) => (list.includes(each) ? list : [...list, each]),
        completed,
    );
    const doneCount = available.filter((m) =>
        isComplete(completedHere, m),
    ).length;
    const { resume, recommended } = focusModules(
        held,
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
            subtitle={t('done.subtitle')}
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
                        {t('done.backToLibrary')}
                    </Button>
                    {next && (
                        <Button
                            variant="filled"
                            color="indigo"
                            loading={opening}
                            onClick={() => onNext(next.scope)}
                        >
                            {t('done.next', { title: next.title })}
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
                    <Trans
                        t={t}
                        i18nKey="done.progress"
                        values={{ done: doneCount, total: available.length }}
                        components={{ b: <b /> }}
                    />
                </Text>
                {next ? (
                    <Box
                        component="article"
                        className={styles.focusCard}
                        data-learn-next={next.scope}
                    >
                        <span className={styles.overline}>
                            {t('done.recommendedNext')}
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
                        <span className={styles.overline}>
                            {t('done.recommendation')}
                        </span>
                        <h2>{t('done.allCompleteTitle')}</h2>
                        <p>{t('done.allCompleteBody')}</p>
                    </Box>
                )}
            </Stack>
        </MantineModal>
    );
};
