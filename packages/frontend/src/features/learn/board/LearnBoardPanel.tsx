import { type LearnAskMatch, type LearnBadgeTier } from '@lightdash/common';
import {
    AskBar,
    BOARD_WIDTH,
    BoardRail,
    ClusterBoard,
    defaultRoleFor,
    plural,
    resolveMatches,
    ROLE_LABEL,
    RoleTabs,
    useLearnModel,
    type ProjectMemberRole,
    type Seat,
} from '@lightdash/learn-ui';
import { useReducedMotion } from '@mantine/hooks';
import { IconSchool } from '@tabler/icons-react';
import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type FC,
} from 'react';
import { useNavigate, useParams } from 'react-router';
import SuboptimalState from '../../../components/common/SuboptimalState/SuboptimalState';
import useApp from '../../../providers/App/useApp';
import {
    setLessonBookmark,
    useLearnAsk,
    useLearnBadges,
    useLearnCatalogue,
    useLearnCourse,
    useLearnRollups,
} from '../hooks';
import styles from './LearnBoardPanel.module.css';

/** The answer on screen, kept while the next request is in flight. */
type AskAnswer = { query: string; matches: LearnAskMatch[] };

export const LearnBoardPanel: FC = () => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const navigate = useNavigate();
    const { user } = useApp();
    const {
        roleScopes,
        isUnlocked,
        effectiveEntry,
        effectiveRollup,
        courseFor,
        railModel,
        suggestionsFor,
        boardHighlights,
    } = useLearnModel();
    const catalogue = useLearnCatalogue();
    const { rollups: rawRollups } = useLearnRollups();
    const badges = useLearnBadges();
    const ask = useLearnAsk();
    const [answer, setAnswer] = useState<AskAnswer | null>(null);
    const reducedMotion = useReducedMotion() ?? false;
    const boardRef = useRef<HTMLDivElement>(null);
    const tabsRef = useRef<HTMLDivElement>(null);
    const frameRef = useRef<number | null>(null);
    const askSeqRef = useRef(0);
    const askInFlightRef = useRef(false);

    // Not initialised from the org role: that query is still async at mount,
    // so `picked` stays null until the learner overrides the derived default.
    const [picked, setPicked] = useState<ProjectMemberRole | null>(null);
    const role = picked ?? defaultRoleFor(user.data?.role);
    const [prevRole, setPrevRole] = useState<ProjectMemberRole | null>(null);
    const [origin, setOrigin] = useState<Seat | null>(null);
    const [burst, setBurst] = useState(false);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const selectedCourse = useLearnCourse(selectedId ?? undefined);

    useEffect(
        () => () => {
            if (frameRef.current !== null)
                cancelAnimationFrame(frameRef.current);
        },
        [],
    );

    const { reset: resetAsk, mutate: runAsk } = ask;
    // One request at a time, and re-asking the answer on screen is a no-op:
    // every submit costs an upstream embedding. The pane is left open.
    const submitAsk = useCallback(
        (query: string) => {
            if (askInFlightRef.current) return;
            if (answer !== null && answer.query === query) return;
            askSeqRef.current += 1;
            askInFlightRef.current = true;
            const seq = askSeqRef.current;
            const current = () => seq === askSeqRef.current;
            runAsk(
                { query },
                {
                    onSuccess: (data) => {
                        if (current())
                            setAnswer({ query, matches: data.matches });
                    },
                    onError: () => {
                        if (current()) setAnswer(null);
                    },
                    onSettled: () => {
                        if (current()) askInFlightRef.current = false;
                    },
                },
            );
        },
        [runAsk, answer],
    );
    const clearAsk = useCallback(() => {
        // A response still in flight belongs to a question the learner dropped.
        askSeqRef.current += 1;
        askInFlightRef.current = false;
        setAnswer(null);
        resetAsk();
    }, [resetAsk]);

    const pickRole = useCallback(
        (next: ProjectMemberRole, element: HTMLElement) => {
            if (next === role) {
                setPicked(next);
                return;
            }
            if (frameRef.current !== null)
                cancelAnimationFrame(frameRef.current);
            const board = boardRef.current;
            if (!reducedMotion && board) {
                const b = board.getBoundingClientRect();
                const t = element.getBoundingClientRect();
                // The board may be scaled down to fit; seats are in board space.
                const scale = b.width > 0 ? b.width / BOARD_WIDTH : 1;
                setOrigin({
                    x: (t.left + t.width / 2 - b.left) / scale,
                    y: (t.top + t.height / 2 - b.top) / scale,
                });
            } else {
                setOrigin(null);
            }
            setPrevRole(role);
            setPicked(next);
            setSelectedId(null);
            // The answer is kept: the query has not changed, only which of its
            // matches the new role can open, so the highlights re-derive.
            setBurst(true);
            frameRef.current = requestAnimationFrame(() => {
                frameRef.current = requestAnimationFrame(() => setBurst(false));
            });
        },
        [role, reducedMotion],
    );

    // Closing the pane unmounts the focused close button, so hand focus back
    // to the node that opened it, else the selected role tab.
    const clearSelection = useCallback(() => {
        const node = boardRef.current?.querySelector<HTMLElement>(
            'button[aria-pressed="true"]:not(:disabled)',
        );
        const tab = tabsRef.current?.querySelector<HTMLElement>(
            '[role="tab"][aria-selected="true"]',
        );
        setSelectedId(null);
        (node ?? tab)?.focus();
    }, []);

    const held = useMemo(() => roleScopes(role), [roleScopes, role]);
    // CS-169: every lessonCount downstream of here — railModel/moduleProgress
    // denominators, node numerals, rail and pane "N lessons" — is the count of
    // lessons visible to the selected role, so the twin board model stays
    // untouched while a scope-group module renders per-role counts.
    // Visible-lesson counts only make sense for modules the selected role
    // HOLDS. A locked ask-match or a completed row from a previous role still
    // describes the whole module — showing '0 lessons' there would be a lie.
    const entries = useMemo(
        () =>
            (catalogue.data?.courses ?? []).map((entry) =>
                isUnlocked(entry, held) ? effectiveEntry(entry, held) : entry,
            ),
        [catalogue.data, held, isUnlocked, effectiveEntry],
    );
    // Doneness is derived too (CS-169 §6): a completed module whose visible
    // lesson set grew re-opens. effectiveRollup is the identity for a module
    // the role doesn't hold (visible count 0), so completed rows from other
    // roles stay completed.
    const rollups = useMemo(() => {
        const derived = new Map(rawRollups);
        for (const entry of entries) {
            const rollup = effectiveRollup(
                entry,
                rawRollups.get(entry.id),
                held,
            );
            if (rollup) derived.set(entry.id, rollup);
        }
        return derived;
    }, [rawRollups, entries, held, effectiveRollup]);
    const prevHeld = useMemo(
        () => (prevRole ? roleScopes(prevRole) : null),
        [prevRole, roleScopes],
    );
    const rail = useMemo(
        () => railModel(entries, held, rollups),
        [entries, held, rollups, railModel],
    );
    const heldEntries = useMemo(
        () => courseFor(entries, held),
        [entries, held, courseFor],
    );
    const tiers = useMemo((): Map<string, LearnBadgeTier> | null => {
        const rows = badges.data?.badges;
        if (!rows) return null;
        return new Map(rows.map((badge) => [badge.courseId, badge.tier]));
    }, [badges.data]);
    const suggestions = useMemo(
        () =>
            catalogue.data
                ? suggestionsFor(catalogue.data.suggestions, entries, held)
                : [],
        [catalogue.data, entries, held, suggestionsFor],
    );
    const matches = useMemo(
        () =>
            answer === null ? null : resolveMatches(answer.matches, entries),
        [answer, entries],
    );
    const highlights = useMemo(
        () =>
            matches === null || matches.length === 0
                ? null
                : boardHighlights(matches, entries, held),
        [matches, entries, held, boardHighlights],
    );

    const openCourse = (courseId: string) =>
        navigate(
            `/projects/${projectUuid}/learn/courses/${encodeURIComponent(courseId)}`,
        );
    const openMatch = (courseId: string, lessonId: string | null) => {
        if (lessonId !== null) setLessonBookmark(courseId, lessonId);
        void openCourse(courseId);
    };

    if (catalogue.isError) {
        return (
            <SuboptimalState
                icon={IconSchool}
                title="Learn is unavailable"
                description="Learn content is fetched from Lightdash University. Check the instance can reach it, then retry."
            />
        );
    }
    if (catalogue.isLoading) {
        return <SuboptimalState loading title="Loading your course" />;
    }

    return (
        <div className={styles.scroller}>
            <div className={styles.card}>
                <div className={styles.boardColumn}>
                    <div className={styles.header}>
                        <h2 className={styles.title}>Your course</h2>
                        <span className={styles.sub}>
                            Everything your {ROLE_LABEL[role]} role unlocks:{' '}
                            {plural(rail.mine.length, 'module')},{' '}
                            {rail.overall.modulesComplete} finished.
                        </span>
                        <AskBar
                            entries={entries}
                            suggestions={suggestions}
                            matches={matches}
                            lockedIds={highlights?.locked ?? new Set<string>()}
                            isSearching={ask.isLoading}
                            isError={ask.isError}
                            onSubmit={submitAsk}
                            onClear={clearAsk}
                            onOpen={openMatch}
                        />
                    </div>
                    {/* The tabs sit next to the rings the nodes fly out of. */}
                    <div className={styles.tabsRow} ref={tabsRef}>
                        <RoleTabs role={role} onPick={pickRole} />
                    </div>
                    {rail.mine.length === 0 ? (
                        <SuboptimalState
                            icon={IconSchool}
                            title="Nothing to learn yet"
                            description="This role unlocks no modules in the current catalogue."
                        />
                    ) : (
                        <ClusterBoard
                            entries={entries}
                            held={held}
                            prevHeld={prevHeld}
                            rollups={rollups}
                            selectedId={selectedId}
                            nextUpId={rail.nextUpId}
                            origin={origin}
                            burst={burst}
                            reducedMotion={reducedMotion}
                            highlights={highlights}
                            onSelect={setSelectedId}
                            boardRef={boardRef}
                        />
                    )}
                </div>
                <BoardRail
                    rail={rail}
                    rollups={rollups}
                    role={role}
                    held={held}
                    heldEntries={heldEntries}
                    tiers={tiers}
                    tiersLoading={badges.isInitialLoading}
                    selectedId={selectedId}
                    onSelect={setSelectedId}
                    onClearSelection={clearSelection}
                    onOpen={openCourse}
                    selectedCourse={selectedCourse.data}
                    selectedCourseLoading={selectedCourse.isInitialLoading}
                    selectedCourseError={selectedCourse.isError}
                />
            </div>
        </div>
    );
};
