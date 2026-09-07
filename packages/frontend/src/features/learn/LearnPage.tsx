import { subject } from '@casl/ability';
import { type ProjectMemberRole, ProjectType } from '@lightdash/common';
import {
    Box,
    Button,
    Checkbox,
    Group,
    Menu,
    TextInput,
    Tooltip,
    UnstyledButton,
} from '@mantine/core';
import {
    IconChevronDown,
    IconHelpCircle,
    IconSearch,
} from '@tabler/icons-react';
import { type FC, useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router';
import MantineIcon from '../../components/common/MantineIcon';
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
import { useLearnProgress } from './progress';
import { thumbnailFor } from './thumbnails';
import { useEnableLearn } from './useEnableLearn';
import { useStartWalkthrough } from './useStartWalkthrough';

const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
};

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
            <Box className={styles.progressRow}>
                <span>
                    {state === 'soon'
                        ? 'Coming soon'
                        : state === 'done'
                          ? 'Complete'
                          : `${module.stepCount} steps`}
                </span>
                <span>
                    {module.minRole && !heldByRole
                        ? `${ROLE_LABELS[module.minRole]} and above`
                        : ''}
                </span>
            </Box>
            <Box
                className={styles.segments}
                role="img"
                aria-label={
                    state === 'done'
                        ? 'Walkthrough complete'
                        : state === 'started'
                          ? 'Walkthrough started'
                          : 'Not started'
                }
            >
                <span
                    className={`${styles.seg} ${
                        state === 'started' || state === 'done'
                            ? styles.segOn
                            : ''
                    }`}
                />
                <span
                    className={`${styles.seg} ${styles.segEnd} ${
                        state === 'done' ? styles.segEndOn : ''
                    }`}
                />
            </Box>
            {state !== 'soon' && (
                <Button
                    className={styles.cta}
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
    );
};

/**
 * The learner's library: every feature they can practise in the training
 * project, one card each, grouped as the scope registry groups them. Start
 * opens the walkthrough in a fresh copy of the training project and brings
 * the learner back here when it ends.
 */
const LearnPage: FC = () => {
    const navigate = useNavigate();
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
    useEffect(() => {
        if (
            projectRoute?.project.type === ProjectType.PREVIEW &&
            trainingProject
        ) {
            void navigate(`/projects/${trainingProject.projectUuid}/learn`, {
                replace: true,
            });
        }
    }, [projectRoute?.project.type, trainingProject, navigate]);

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
    const [activeGroup, setActiveGroup] = useState<LearnGroup | null>(null);

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
    const jumpTo = (group: LearnGroup) => {
        setActiveGroup(group);
        document
            .getElementById(`learn-group-${group}`)
            ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

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
            <Box component="aside" className={styles.sidebar}>
                <Box className={styles.sidebarInner}>
                    <h2 className={styles.sidebarTitle}>Library</h2>
                    <Box
                        component="nav"
                        className={styles.nav}
                        aria-label="Library"
                    >
                        {groups.map((group) => {
                            const Glyph = GROUP_ICONS[group];
                            return (
                                <UnstyledButton
                                    key={group}
                                    type="button"
                                    className={`${styles.navItem} ${
                                        activeGroup === group
                                            ? styles.navItemActive
                                            : ''
                                    }`}
                                    aria-current={
                                        activeGroup === group
                                            ? 'true'
                                            : undefined
                                    }
                                    onClick={() => jumpTo(group)}
                                >
                                    <span
                                        className={styles.navIcon}
                                        style={groupVars(group)}
                                    >
                                        <MantineIcon icon={Glyph} size={15} />
                                    </span>
                                    {GROUP_LABELS[group]}
                                </UnstyledButton>
                            );
                        })}
                    </Box>
                </Box>
            </Box>
            <Box className={styles.main}>
                <Box className={styles.homeHead}>
                    <h1 className={styles.greeting}>{greeting()}</h1>
                    <Box className={styles.stats} data-learn-role={role}>
                        <Menu position="bottom-end" withinPortal>
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
                <Box className={styles.focusGrid}>
                    {resume ? (
                        <Box
                            component="article"
                            className={styles.focusCard}
                            data-learn-resume={resume.scope}
                        >
                            <span
                                className={`${styles.overline} ${styles.overlineAccent}`}
                            >
                                Resume
                            </span>
                            <h2>{resume.title}</h2>
                            <p>{resume.blurb}</p>
                            <Button
                                className={styles.focusAction}
                                variant="light"
                                size="compact-md"
                                loading={opening === resume.scope}
                                onClick={() => start(resume.scope)}
                            >
                                Resume module
                            </Button>
                        </Box>
                    ) : (
                        <Box component="article" className={styles.focusCard}>
                            <span
                                className={`${styles.overline} ${styles.overlineAccent}`}
                            >
                                Resume
                            </span>
                            <h2>No module in progress</h2>
                            <p>Start a module from the library below.</p>
                        </Box>
                    )}
                    {recommended ? (
                        <Box
                            component="article"
                            className={styles.focusCard}
                            data-learn-recommended={recommended.scope}
                        >
                            <span className={styles.overline}>
                                Recommended next
                            </span>
                            <h2>{recommended.title}</h2>
                            <p>{recommended.blurb}</p>
                            <Button
                                className={styles.focusAction}
                                variant="default"
                                size="compact-md"
                                loading={opening === recommended.scope}
                                onClick={() => start(recommended.scope)}
                            >
                                Start
                            </Button>
                        </Box>
                    ) : (
                        <Box component="article" className={styles.focusCard}>
                            <span className={styles.overline}>
                                Recommendation
                            </span>
                            <h2>Nothing new for {ROLE_LABELS[role]}</h2>
                            <p>
                                Use Show extra modules when you want to go
                                beyond your role.
                            </p>
                        </Box>
                    )}
                </Box>
                <Box className={styles.toolbar}>
                    <TextInput
                        className={styles.search}
                        size="sm"
                        placeholder="Search the library"
                        aria-label="Search the library"
                        leftSection={<MantineIcon icon={IconSearch} />}
                        value={query}
                        onChange={(event) =>
                            setQuery(event.currentTarget.value)
                        }
                    />
                    <Group className={styles.toggles} gap="md">
                        <Group gap={6} wrap="nowrap">
                            <Checkbox
                                size="xs"
                                label="Show extra modules"
                                checked={showExtra}
                                onChange={(event) =>
                                    setShowExtra(event.currentTarget.checked)
                                }
                            />
                            <Tooltip
                                label="Modules for roles above yours, with the role they need"
                                withArrow
                            >
                                <span
                                    role="img"
                                    aria-label="Modules for roles above yours, with the role they need"
                                >
                                    <MantineIcon
                                        icon={IconHelpCircle}
                                        size={14}
                                        color="dimmed"
                                    />
                                </span>
                            </Tooltip>
                        </Group>
                        <Checkbox
                            size="xs"
                            label="Coming soon"
                            checked={showSoon}
                            onChange={(event) =>
                                setShowSoon(event.currentTarget.checked)
                            }
                        />
                    </Group>
                </Box>
                {groups.length === 0 && (
                    <Box className={styles.empty}>
                        No modules match this search.
                    </Box>
                )}
                {groups.map((group) => (
                    <Box
                        key={group}
                        component="section"
                        id={`learn-group-${group}`}
                        className={styles.group}
                        data-learn-group={group}
                    >
                        <h2 className={styles.groupTitle}>
                            {GROUP_LABELS[group]}
                        </h2>
                        <p className={styles.groupDesc}>
                            {GROUP_DESCRIPTIONS[group]}
                        </p>
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
