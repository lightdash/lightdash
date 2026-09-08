import { subject } from '@casl/ability';
import { type ProjectMemberRole, ProjectType } from '@lightdash/common';
import {
    Box,
    Button,
    Menu,
    TextInput,
    Tooltip,
    UnstyledButton,
} from '@mantine/core';
import {
    IconCheck,
    IconChevronDown,
    IconHelpCircle,
    IconLayoutGrid,
    IconPlayerPlay,
    IconSearch,
    IconCircleCheck,
} from '@tabler/icons-react';
import { type FC, useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router';
import MantineIcon from '../../components/common/MantineIcon';
import { getGreeting } from '../../ee/features/homepageBuilder/greeting';
import useHealth from '../../hooks/health/useHealth';
import { useOptionalProjectRoute } from '../../hooks/useProjectRoute';
import { useProjects } from '../../hooks/useProjects';
import useApp from '../../providers/App/useApp';
import { useLearnAvailability } from './availability';
import {
    buildLearnCatalogue,
    focusModules,
    GROUP_DESCRIPTIONS,
    GROUP_LABELS,
    GROUP_ORDER,
    roleFromOrganizationRole,
    roleHolds,
    ROLE_LABELS,
    ROLE_ORDER,
    sortForRole,
    type LearnGroup,
    type LearnModule,
} from './catalogue';
import { EnableLearnPanel } from './EnableLearnPanel';
import { GROUP_ICONS, groupVars } from './groupVisuals';
import styles from './Learn.module.css';
import { readLearnOrigin, rememberLearnOrigin } from './origin';
import { useLearnProgress } from './progress';
import { thumbnailFor } from './thumbnails';
import { useEnableLearn } from './useEnableLearn';
import { useStartWalkthrough } from './useStartWalkthrough';

type CardState = 'soon' | 'ready' | 'started' | 'done';

const stateOf = (
    module: LearnModule,
    started: string[],
    completed: string[],
): CardState =>
    !module.available
        ? 'soon'
        : completed.includes(module.scope)
          ? 'done'
          : started.includes(module.scope)
            ? 'started'
            : 'ready';

const ModuleCard: FC<{
    module: LearnModule;
    state: CardState;
    heldByRole: boolean;
    opening: boolean;
    onStart: (scope: string) => void;
}> = ({ module, state, heldByRole, opening, onStart }) => {
    const Glyph = GROUP_ICONS[module.group];
    const shot = thumbnailFor(module.scope);
    return (
        <Box
            component="article"
            className={`${styles.card} ${state === 'soon' ? styles.cardSoon : ''}`}
            data-learn-module={module.scope}
            data-learn-state={state === 'started' ? 'ready' : state}
        >
            <Box
                className={styles.band}
                style={groupVars(module.group)}
                aria-hidden
            >
                <Box className={styles.blob}>
                    <MantineIcon icon={Glyph} size={17} stroke={1.6} />
                </Box>
                {shot && (
                    <Box className={styles.shot}>
                        <img alt="" loading="lazy" src={shot} />
                    </Box>
                )}
            </Box>
            <h3 className={styles.title}>{module.title}</h3>
            {module.blurb !== '' && (
                <p className={styles.desc}>{module.blurb}</p>
            )}
            <Box className={styles.foot}>
                <Box className={styles.footStatus}>
                    {state === 'soon' ? (
                        <span>Coming soon</span>
                    ) : state === 'done' ? (
                        <span className={styles.done}>
                            <MantineIcon icon={IconCircleCheck} size={14} />
                            Complete
                        </span>
                    ) : (
                        <span>{module.stepCount} steps</span>
                    )}
                    {module.minRole && !heldByRole && (
                        <span>{ROLE_LABELS[module.minRole]} and above</span>
                    )}
                </Box>
                {state !== 'soon' && (
                    <Button
                        size="compact-sm"
                        variant="default"
                        loading={opening}
                        onClick={() => onStart(module.scope)}
                    >
                        {state === 'done'
                            ? 'Start again'
                            : state === 'started'
                              ? 'Resume'
                              : 'Start'}
                    </Button>
                )}
            </Box>
        </Box>
    );
};

/**
 * The learner's library: every feature they can practise in the training
 * project, one card each, grouped as the scope registry groups them. Start
 * opens the walkthrough in a fresh copy of the training project and brings
 * the learner back here when it ends.
 */
const LearnPage: FC = () => {
    const { user } = useApp();
    const { data: health } = useHealth();
    const { data: projects } = useProjects();
    const trainingProject = projects?.find(
        (project) => project.type === ProjectType.TRAINING,
    );
    // Before the org has enabled Learn (CS-257): admins get the button,
    // everyone else a pointer to an admin.
    const organizationUuid = user.data?.organizationUuid;
    const canEnableLearn =
        !!organizationUuid &&
        (user.data?.ability.can(
            'manage',
            subject('Organization', { organizationUuid }),
        ) ??
            false);
    const enableLearn = useEnableLearn();
    // The library is never shown inside a preview (a training copy): it
    // belongs to the shared training project, so a preview's /learn goes
    // there instead.
    const projectRoute = useOptionalProjectRoute();
    // The library is opened on the learner's own project (the Learn icon
    // keeps the project route) and remembers it, so a walkthrough's Skip
    // and Back to library return to this project rather than the training
    // project. A preview's /learn goes to the remembered project's library
    // when there is one, else the training project's.
    useEffect(() => {
        const type = projectRoute?.project.type;
        if (
            projectRoute &&
            type !== ProjectType.PREVIEW &&
            type !== ProjectType.TRAINING
        ) {
            rememberLearnOrigin(projectRoute.project.projectUuid);
        }
    }, [projectRoute]);
    // A preview's /learn has no library of its own (see above): it goes to
    // the remembered project's, or the training project's.
    const previewRedirect = (() => {
        if (
            projectRoute?.project.type !== ProjectType.PREVIEW ||
            !trainingProject
        )
            return null;
        const origin = readLearnOrigin();
        const returnProject =
            origin &&
            projects?.some((project) => project.projectUuid === origin)
                ? origin
                : trainingProject.projectUuid;
        return `/projects/${returnProject}/learn`;
    })();

    // Only modules this instance can run: a walkthrough clicks the real
    // product, so a feature the instance hides has nothing to click.
    const { isOpen } = useLearnAvailability();
    const catalogue = useMemo(
        () => buildLearnCatalogue().filter(isOpen),
        [isOpen],
    );
    const { completed, started, lastStarted } = useLearnProgress();
    const [role, setRole] = useState<ProjectMemberRole>(() =>
        roleFromOrganizationRole(user.data?.role),
    );
    const [query, setQuery] = useState('');
    const [showExtra, setShowExtra] = useState(true);
    const [showSoon, setShowSoon] = useState(true);
    // One group, or every group: the chips beside the search.
    const [groupFilter, setGroupFilter] = useState<LearnGroup | null>(null);

    const visible = useMemo(() => {
        const needle = query.trim().toLowerCase();
        return sortForRole(role, catalogue).filter(
            (module) =>
                (showExtra || roleHolds(role, module)) &&
                (showSoon || module.available) &&
                (needle === '' ||
                    module.title.toLowerCase().includes(needle) ||
                    module.scope.toLowerCase().includes(needle)),
        );
    }, [catalogue, role, showExtra, showSoon, query]);
    const groups = GROUP_ORDER.filter((group) =>
        visible.some((module) => module.group === group),
    );
    // A chip narrows the page to one group; the chips themselves always
    // list every group with a match, so the way back is a click away.
    const shownGroups =
        groupFilter === null
            ? groups
            : groups.filter((group) => group === groupFilter);
    const available = catalogue.filter((m) => m.available);
    const doneCount = available.filter((m) =>
        completed.includes(m.scope),
    ).length;
    // Training exists to teach what a learner cannot yet do, so the
    // recommendation is the first unfinished walkthrough, held-by-role ones
    // first (sortForRole), rather than nothing for a viewer.
    const { resume, recommended } = focusModules(
        role,
        available,
        completed,
        lastStarted,
    );

    // Start makes the learner's copy and goes straight into it; the
    // walkthrough brings them back to the library side when it ends.
    const { start, opening } = useStartWalkthrough(
        trainingProject?.projectUuid,
    );

    if (previewRedirect) return <Navigate to={previewRedirect} replace />;
    // Learn switched off for the instance: the route falls through to the
    // project's home.
    if (health && !health.learn.enabled) {
        return (
            <Navigate
                to={
                    projectRoute
                        ? `/projects/${projectRoute.project.projectUuid}/home`
                        : '/projects'
                }
                replace
            />
        );
    }
    if (projects && !trainingProject) {
        return (
            <EnableLearnPanel
                canEnable={canEnableLearn}
                enabling={enableLearn.isLoading}
                error={enableLearn.error?.error.message ?? null}
                onEnable={() => enableLearn.mutate()}
                catalogue={catalogue}
            />
        );
    }

    return (
        <Box className={styles.shell}>
            <Box className={styles.main}>
                <Box component="header" className={styles.homeHead}>
                    <h1 className={styles.greeting}>
                        {getGreeting(user.data?.firstName)}. What do you want to
                        learn?
                    </h1>
                    <TextInput
                        className={styles.search}
                        size="md"
                        radius="xl"
                        placeholder="Search the library"
                        aria-label="Search the library"
                        leftSection={<MantineIcon icon={IconSearch} />}
                        value={query}
                        onChange={(event) =>
                            setQuery(event.currentTarget.value)
                        }
                    />
                    <Box
                        component="nav"
                        className={styles.chips}
                        aria-label="Library groups"
                    >
                        <UnstyledButton
                            type="button"
                            className={`${styles.chip} ${
                                groupFilter === null ? styles.chipOn : ''
                            }`}
                            aria-pressed={groupFilter === null}
                            onClick={() => setGroupFilter(null)}
                        >
                            All
                        </UnstyledButton>
                        {groups.map((group) => (
                            <UnstyledButton
                                key={group}
                                type="button"
                                className={`${styles.chip} ${
                                    groupFilter === group ? styles.chipOn : ''
                                }`}
                                style={groupVars(group)}
                                aria-pressed={groupFilter === group}
                                data-learn-chip={group}
                                onClick={() =>
                                    setGroupFilter(
                                        groupFilter === group ? null : group,
                                    )
                                }
                            >
                                <span
                                    className={styles.chipSwatch}
                                    aria-hidden
                                />
                                {GROUP_LABELS[group]}
                            </UnstyledButton>
                        ))}
                        <span className={styles.chipRule} aria-hidden />
                        <UnstyledButton
                            type="button"
                            className={`${styles.chip} ${
                                showExtra ? styles.chipOn : ''
                            }`}
                            role="switch"
                            aria-checked={showExtra}
                            aria-label="Show extra modules"
                            onClick={() => setShowExtra(!showExtra)}
                        >
                            {showExtra && (
                                <MantineIcon icon={IconCheck} size={12} />
                            )}
                            Extra modules
                            <Tooltip
                                label="Modules for roles above yours, with the role they need"
                                withArrow
                            >
                                <span
                                    className={styles.chipHelp}
                                    role="img"
                                    aria-label="Modules for roles above yours, with the role they need"
                                >
                                    <MantineIcon
                                        icon={IconHelpCircle}
                                        size={13}
                                    />
                                </span>
                            </Tooltip>
                        </UnstyledButton>
                        <UnstyledButton
                            type="button"
                            className={`${styles.chip} ${
                                showSoon ? styles.chipOn : ''
                            }`}
                            role="switch"
                            aria-checked={showSoon}
                            aria-label="Coming soon"
                            onClick={() => setShowSoon(!showSoon)}
                        >
                            {showSoon && (
                                <MantineIcon icon={IconCheck} size={12} />
                            )}
                            Coming soon
                        </UnstyledButton>
                    </Box>
                    <Box className={styles.stats} data-learn-role={role}>
                        <Menu position="bottom" withinPortal>
                            <Menu.Target>
                                <UnstyledButton
                                    type="button"
                                    className={`${styles.stat} ${styles.statButton}`}
                                    aria-haspopup="menu"
                                >
                                    Viewing as <b>{ROLE_LABELS[role]}</b>
                                    <MantineIcon
                                        icon={IconChevronDown}
                                        size={14}
                                    />
                                </UnstyledButton>
                            </Menu.Target>
                            <Menu.Dropdown>
                                {ROLE_ORDER.map((candidate) => (
                                    <Menu.Item
                                        key={candidate}
                                        onClick={() => setRole(candidate)}
                                        fw={
                                            candidate === role ? 600 : undefined
                                        }
                                    >
                                        {ROLE_LABELS[candidate]}
                                    </Menu.Item>
                                ))}
                            </Menu.Dropdown>
                        </Menu>
                        <span
                            className={styles.stat}
                            data-learn-progress={`${doneCount}/${available.length}`}
                        >
                            Modules{' '}
                            <b>
                                {doneCount} of {available.length}
                            </b>
                        </span>
                    </Box>
                </Box>
                {(resume || recommended) && (
                    <Box component="section" className={styles.section}>
                        <h2 className={styles.sectionTitle}>
                            <MantineIcon icon={IconPlayerPlay} size={14} />
                            Continue
                        </h2>
                        <Box className={styles.rows}>
                            {resume && (
                                <Box
                                    component="article"
                                    className={styles.row}
                                    data-learn-resume={resume.scope}
                                >
                                    <span
                                        className={styles.rowTile}
                                        style={groupVars(resume.group)}
                                    >
                                        <MantineIcon
                                            icon={GROUP_ICONS[resume.group]}
                                            size={16}
                                        />
                                    </span>
                                    <span className={styles.rowText}>
                                        <b>{resume.title}</b>
                                        <small>
                                            Resume · {resume.stepCount} steps
                                        </small>
                                    </span>
                                    <Button
                                        className={styles.rowAction}
                                        variant="light"
                                        size="compact-sm"
                                        loading={opening === resume.scope}
                                        onClick={() => start(resume.scope)}
                                    >
                                        Resume
                                    </Button>
                                </Box>
                            )}
                            {recommended && (
                                <Box
                                    component="article"
                                    className={styles.row}
                                    data-learn-recommended={recommended.scope}
                                >
                                    <span
                                        className={styles.rowTile}
                                        style={groupVars(recommended.group)}
                                    >
                                        <MantineIcon
                                            icon={
                                                GROUP_ICONS[recommended.group]
                                            }
                                            size={16}
                                        />
                                    </span>
                                    <span className={styles.rowText}>
                                        <b>{recommended.title}</b>
                                        <small>
                                            Recommended next ·{' '}
                                            {recommended.stepCount} steps
                                        </small>
                                    </span>
                                    <Button
                                        className={styles.rowAction}
                                        variant="default"
                                        size="compact-sm"
                                        loading={opening === recommended.scope}
                                        onClick={() => start(recommended.scope)}
                                    >
                                        Start
                                    </Button>
                                </Box>
                            )}
                        </Box>
                    </Box>
                )}
                {groups.length === 0 && (
                    <Box className={styles.empty}>
                        No modules match this search.
                    </Box>
                )}
                {shownGroups.map((group) => (
                    <Box
                        key={group}
                        component="section"
                        id={`learn-group-${group}`}
                        className={`${styles.group} ${styles.section}`}
                        data-learn-group={group}
                    >
                        <h2 className={styles.sectionTitle}>
                            <MantineIcon icon={IconLayoutGrid} size={14} />
                            {GROUP_LABELS[group]}
                            <span className={styles.sectionDesc}>
                                {GROUP_DESCRIPTIONS[group]}
                            </span>
                        </h2>
                        <Box className={styles.grid}>
                            {visible
                                .filter((module) => module.group === group)
                                .map((module) => (
                                    <ModuleCard
                                        key={module.scope}
                                        module={module}
                                        state={stateOf(
                                            module,
                                            started,
                                            completed,
                                        )}
                                        heldByRole={roleHolds(role, module)}
                                        opening={opening === module.scope}
                                        onStart={start}
                                    />
                                ))}
                        </Box>
                    </Box>
                ))}
            </Box>
        </Box>
    );
};

export default LearnPage;
