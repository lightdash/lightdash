import { type ProjectMemberRole } from '@lightdash/common';
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
import SuboptimalState from '../../../../components/common/SuboptimalState/SuboptimalState';
import useApp from '../../../../providers/App/useApp';
import { useLearnCatalogue, useLearnRollups } from '../../hooks';
import { BOARD_WIDTH, type Seat } from '../layout';
import {
    defaultRoleFor,
    plural,
    railModel,
    ROLE_LABEL,
    roleScopes,
} from '../model';
import { BoardRail } from './BoardRail';
import { ClusterBoard } from './ClusterBoard';
import styles from './LearnBoard.module.css';
import { RoleTabs } from './RoleTabs';

export const LearnBoardPanel: FC = () => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const navigate = useNavigate();
    const { user } = useApp();
    const catalogue = useLearnCatalogue();
    const { rollups } = useLearnRollups();
    const reducedMotion = useReducedMotion() ?? false;
    const boardRef = useRef<HTMLDivElement>(null);
    const headerRef = useRef<HTMLDivElement>(null);
    const frameRef = useRef<number | null>(null);

    // Not initialised from the org role: that query is still async at mount,
    // so `picked` stays null until the learner overrides the derived default.
    const [picked, setPicked] = useState<ProjectMemberRole | null>(null);
    const role = picked ?? defaultRoleFor(user.data?.role);
    const [prevRole, setPrevRole] = useState<ProjectMemberRole | null>(null);
    const [origin, setOrigin] = useState<Seat | null>(null);
    const [burst, setBurst] = useState(false);
    const [selectedId, setSelectedId] = useState<string | null>(null);

    useEffect(
        () => () => {
            if (frameRef.current !== null)
                cancelAnimationFrame(frameRef.current);
        },
        [],
    );

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
        const tab = headerRef.current?.querySelector<HTMLElement>(
            '[role="tab"][aria-selected="true"]',
        );
        setSelectedId(null);
        (node ?? tab)?.focus();
    }, []);

    const entries = useMemo(
        () => catalogue.data?.courses ?? [],
        [catalogue.data],
    );
    const held = useMemo(() => roleScopes(role), [role]);
    const prevHeld = useMemo(
        () => (prevRole ? roleScopes(prevRole) : null),
        [prevRole],
    );
    const rail = useMemo(
        () => railModel(entries, held, rollups),
        [entries, held, rollups],
    );

    const openCourse = (courseId: string) =>
        navigate(
            `/projects/${projectUuid}/learn/courses/${encodeURIComponent(courseId)}`,
        );

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
                    <div className={styles.header} ref={headerRef}>
                        <h2 className={styles.title}>Your course</h2>
                        <span className={styles.sub}>
                            Everything your {ROLE_LABEL[role]} role unlocks:{' '}
                            {plural(rail.mine.length, 'module')},{' '}
                            {rail.overall.modulesComplete} finished.
                        </span>
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
                            onSelect={setSelectedId}
                            boardRef={boardRef}
                        />
                    )}
                </div>
                <BoardRail
                    rail={rail}
                    rollups={rollups}
                    selectedId={selectedId}
                    onSelect={setSelectedId}
                    onClearSelection={clearSelection}
                    onOpen={openCourse}
                />
            </div>
        </div>
    );
};
