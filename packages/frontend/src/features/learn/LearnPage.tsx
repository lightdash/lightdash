import { subject } from '@casl/ability';
import { FeatureFlags, ProjectType } from '@lightdash/common';
import {
    Box,
    Button,
    Group,
    Menu,
    TextInput,
    Tooltip,
    UnstyledButton,
} from '@mantine/core';
import {
    IconCheck,
    IconCompass,
    IconFilter,
    IconLayoutGrid,
    IconPlayerPlay,
    IconRotate,
    IconSearch,
    IconCircleCheck,
} from '@tabler/icons-react';
import {
    type FC,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router';
import MantineIcon from '../../components/common/MantineIcon';
import MantineModal from '../../components/common/MantineModal';
import ForbiddenPanel from '../../components/ForbiddenPanel';
import { getGreeting } from '../../ee/features/homepageBuilder/greeting';
import { useOptionalProjectRoute } from '../../hooks/useProjectRoute';
import { useProjects } from '../../hooks/useProjects';
import { useServerFeatureFlag } from '../../hooks/useServerOrClientFeatureFlag';
import useApp from '../../providers/App/useApp';
import useTracking from '../../providers/Tracking/useTracking';
import { EventName } from '../../types/Events';
import { useLearnAvailability } from './availability';
import {
    accessNote,
    buildLearnCatalogue,
    focusModules,
    GROUP_DESCRIPTIONS,
    GROUP_LABELS,
    GROUP_ORDER,
    holds,
    isComplete,
    isStarted,
    sortForLearner,
    type LearnModule,
} from './catalogue';
import { EnableLearnPanel } from './EnableLearnPanel';
import { GROUP_ICONS, groupVars } from './groupVisuals';
import styles from './Learn.module.css';
import {
    libraryPath,
    readLibraryFilters,
    rememberLibrarySearch,
    writeLibraryFilters,
    type LibraryFilters,
} from './libraryFilters';
import { readLearnOrigin, rememberLearnOrigin } from './origin';
import { useLearnProgress } from './progress';
import { createLearnSearch } from './search';
import { thumbnailFor } from './thumbnails';
import { useEnableLearn } from './useEnableLearn';
import { useLearnAccess } from './useLearnAccess';
import { useStartFresh } from './useStartFresh';
import { useStartWalkthrough } from './useStartWalkthrough';

type CardState = 'ready' | 'started' | 'done';

const stateOf = (
    module: LearnModule,
    started: string[],
    completed: string[],
): CardState =>
    module.available && isComplete(completed, module)
        ? 'done'
        : module.available && isStarted(started, module)
          ? 'started'
          : 'ready';

const ModuleCard: FC<{
    module: LearnModule;
    state: CardState;
    /** What the chosen view lacks, named on the card; null when it holds it. */
    note: string | null;
    opening: boolean;
    onStart: (scope: string) => void;
}> = ({ module, state, note, opening, onStart }) => {
    const Glyph = GROUP_ICONS[module.group];
    const shot = thumbnailFor(module.scope);
    return (
        <Box
            component="article"
            className={styles.card}
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
                    {state === 'done' ? (
                        <span className={styles.done}>
                            <MantineIcon icon={IconCircleCheck} size={14} />
                            Complete
                        </span>
                    ) : (
                        <span>
                            {module.available
                                ? `${module.stepCount} steps`
                                : 'Coming Soon'}
                        </span>
                    )}
                    {note && <span>{note}</span>}
                </Box>
                <Button
                    size="compact-sm"
                    variant="default"
                    loading={opening}
                    disabled={!module.available}
                    onClick={() => onStart(module.scope)}
                >
                    {!module.available
                        ? 'Coming Soon'
                        : state === 'done'
                          ? 'Start again'
                          : state === 'started'
                            ? 'Resume'
                            : 'Start'}
                </Button>
            </Box>
        </Box>
    );
};

/**
 * The learner's library: one card per covered scope, grouped by the scope
 * registry. Walkthroughs open a training copy; unsupported modules remain Coming Soon.
 */
const LearnPage: FC = () => {
    const { user } = useApp();
    const { data: learnFlag, isLoading: isLearnFlagLoading } =
        useServerFeatureFlag(FeatureFlags.EnableLearn);
    const { data: projects } = useProjects();
    const trainingProject = projects?.find(
        (project) => project.type === ProjectType.TRAINING,
    );
    // The learner's own copy of the training project, kept across
    // walkthroughs. Start fresh (a button in the toolbar) removes it, so the
    // next walkthrough begins from the seeded state.
    const ownCopy =
        trainingProject &&
        projects?.find(
            (project) =>
                project.type === ProjectType.PREVIEW &&
                project.provisioningSource === 'training' &&
                project.upstreamProjectUuid === trainingProject.projectUuid &&
                project.createdByUserUuid === user.data?.userUuid,
        );
    const [confirmingFresh, setConfirmingFresh] = useState(false);
    const { mutate: startFresh, isLoading: startingFresh } = useStartFresh();
    const navigate = useNavigate();
    // Before the org has enabled Learn (CS-257): admins get the button,
    // everyone else a pointer to an admin.
    const organizationUuid = user.data?.organizationUuid;
    const canViewLearn = user.data?.ability.can(
        'view',
        subject('Learn', { organizationUuid }),
    );
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
        return libraryPath(returnProject);
    })();

    // Only modules this instance can run: a walkthrough clicks the real
    // product, so a feature the instance hides has nothing to click.
    const { isOpen, isSettled } = useLearnAvailability();
    const catalogue = useMemo(
        () => buildLearnCatalogue().filter(isOpen),
        [isOpen],
    );
    const {
        completed,
        started,
        lastStarted,
        isSettled: isProgressSettled,
    } = useLearnProgress();
    // What the learner can do, anywhere: their organization role, any
    // organization-level custom roles, and every project role they hold. The
    // library is that; everything else waits behind the Extra modules
    // toggle.
    const { held } = useLearnAccess();
    // The filters live in the address (see libraryFilters.ts), so a
    // walkthrough brings the learner back to the library as they left it.
    // groupFilter is one group tab, or All.
    const [searchParams, setSearchParams] = useSearchParams();
    const {
        query,
        showExtra,
        showSoon,
        group: groupFilter,
    } = readLibraryFilters(searchParams);
    const setFilters = useCallback(
        (patch: Partial<LibraryFilters>) =>
            setSearchParams((current) => writeLibraryFilters(current, patch), {
                replace: true,
            }),
        [setSearchParams],
    );
    // Remembered for the walkthrough's way back, once this is the library
    // being shown rather than a preview on its way to one.
    const filterSearch = writeLibraryFilters(new URLSearchParams(), {
        query,
        showExtra,
        showSoon,
        group: groupFilter,
    }).toString();
    const isShowingLibrary = !!projects && !previewRedirect;
    useEffect(() => {
        if (!isShowingLibrary) return;
        rememberLibrarySearch(filterSearch ? `?${filterSearch}` : '');
    }, [isShowingLibrary, filterSearch]);

    const search = useMemo(
        () =>
            createLearnSearch(
                sortForLearner(held, catalogue).filter(
                    (module) =>
                        (showExtra || holds(held, module)) &&
                        (showSoon || module.available),
                ),
            ),
        [catalogue, held, showExtra, showSoon],
    );
    const visible = useMemo(() => search(query), [search, query]);
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
    const doneCount = available.filter((m) => isComplete(completed, m)).length;
    // Training exists to teach what a learner cannot yet do, so the
    // recommendation is the first unfinished walkthrough, held-by-role ones
    // first (sortForRole), rather than nothing for a viewer.
    const { resume, recommended } = focusModules(
        held,
        available,
        completed,
        lastStarted,
    );
    // One thing to do next: the recommendation, or whatever was last
    // started if nothing is left to recommend.
    const upNext = recommended ?? resume;

    // Start makes the learner's copy and goes straight into it; the
    // walkthrough brings them back to the library side when it ends.
    const { start, opening } = useStartWalkthrough(
        trainingProject?.projectUuid,
    );
    const startFromCard = useCallback(
        (scope: string) => start(scope, 'card'),
        [start],
    );

    // One view per visit to the library, once the page knows what it is
    // showing: the projects, the instance switch, and the gates that decide
    // which modules are in the catalogue (they answer after the projects
    // do, and the counts below would be short without them), and the
    // progress the instance holds. The redirects
    // below are not views of it, and the call to action before an admin
    // has enabled Learn is (hasTrainingProject false): it is the page a
    // learner lands on.
    const { track } = useTracking();
    const trackedViewRef = useRef(false);
    useEffect(() => {
        if (trackedViewRef.current) return;
        if (!projects || !learnFlag || !isSettled || !isProgressSettled) return;
        if (previewRedirect || !learnFlag.enabled || !canViewLearn) return;
        trackedViewRef.current = true;
        track({
            name: EventName.LEARN_LIBRARY_VIEWED,
            properties: {
                organizationUuid: organizationUuid ?? null,
                trainingProjectUuid: trainingProject?.projectUuid ?? null,
                hasTrainingProject: !!trainingProject,
                // Counted against available walkthroughs, so the numbers
                // are the ones the learner sees rather than every scope the
                // browser has ever recorded progress for.
                moduleCount: available.length,
                startedCount: available.filter((module) =>
                    isStarted(started, module),
                ).length,
                completedCount: available.filter((module) =>
                    isComplete(completed, module),
                ).length,
            },
        });
    }, [
        projects,
        learnFlag,
        isSettled,
        isProgressSettled,
        previewRedirect,
        canViewLearn,
        organizationUuid,
        trainingProject,
        available,
        started,
        completed,
        track,
    ]);

    if (isLearnFlagLoading) return null;
    // Learn switched off for the org: the route falls through to the
    // project's home.
    if (!learnFlag?.enabled) {
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
    if (!canViewLearn) return <ForbiddenPanel />;
    if (previewRedirect) return <Navigate to={previewRedirect} replace />;
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
                        radius="md"
                        placeholder="Search the library"
                        aria-label="Search the library"
                        leftSection={<MantineIcon icon={IconSearch} />}
                        value={query}
                        onChange={(event) =>
                            setFilters({ query: event.currentTarget.value })
                        }
                    />
                </Box>
                {upNext && (
                    <Box
                        component="section"
                        className={`${styles.section} ${styles.upNext}`}
                    >
                        <h2 className={styles.sectionTitle}>
                            <MantineIcon icon={IconPlayerPlay} size={14} />
                            Up next
                        </h2>
                        <Box
                            component="article"
                            className={styles.hero}
                            style={groupVars(upNext.group)}
                            data-learn-recommended={upNext.scope}
                        >
                            <span className={styles.heroTile}>
                                <MantineIcon
                                    icon={GROUP_ICONS[upNext.group]}
                                    size={20}
                                />
                            </span>
                            <Box className={styles.heroBody}>
                                <span className={styles.overline}>
                                    {GROUP_LABELS[upNext.group]}
                                </span>
                                <h3>{upNext.title}</h3>
                                <p>{upNext.blurb}</p>
                                <Box className={styles.heroFoot}>
                                    <span>{`${upNext.stepCount} steps`}</span>
                                    <Button
                                        variant="filled"
                                        color="indigo"
                                        size="compact-md"
                                        loading={opening === upNext.scope}
                                        onClick={() =>
                                            start(
                                                upNext.scope,
                                                recommended
                                                    ? 'recommended'
                                                    : 'resume',
                                            )
                                        }
                                    >
                                        Start
                                    </Button>
                                </Box>
                            </Box>
                        </Box>
                    </Box>
                )}
                <Box className={styles.libraryBar}>
                    <span className={styles.libraryHeading}>
                        {showExtra ? 'Every module' : 'What you can do'}
                    </span>
                    <span
                        className={styles.libraryCount}
                        data-learn-progress={`${doneCount}/${available.length}`}
                    >
                        {doneCount} of {available.length} complete
                    </span>
                </Box>
                <Box className={styles.tabBar}>
                    <Box
                        component="nav"
                        className={styles.tabs}
                        aria-label="Library groups"
                    >
                        <UnstyledButton
                            type="button"
                            className={`${styles.tab} ${
                                groupFilter === null ? styles.tabOn : ''
                            }`}
                            aria-pressed={groupFilter === null}
                            onClick={() => setFilters({ group: null })}
                        >
                            All
                        </UnstyledButton>
                        {groups.map((group) => (
                            <UnstyledButton
                                key={group}
                                type="button"
                                className={`${styles.tab} ${
                                    groupFilter === group ? styles.tabOn : ''
                                }`}
                                style={groupVars(group)}
                                aria-pressed={groupFilter === group}
                                data-learn-chip={group}
                                onClick={() => setFilters({ group })}
                            >
                                <span
                                    className={styles.chipSwatch}
                                    aria-hidden
                                />
                                {GROUP_LABELS[group]}
                            </UnstyledButton>
                        ))}
                    </Box>
                    <Menu
                        position="bottom-end"
                        withinPortal
                        closeOnItemClick={false}
                    >
                        <Menu.Target>
                            <Tooltip label="Filter" withArrow>
                                <UnstyledButton
                                    type="button"
                                    className={`${styles.iconButton} ${
                                        !showExtra || !showSoon
                                            ? styles.iconButtonOn
                                            : ''
                                    }`}
                                    aria-label="Filter"
                                    aria-haspopup="menu"
                                    data-learn-filter
                                >
                                    <MantineIcon icon={IconFilter} size={15} />
                                </UnstyledButton>
                            </Tooltip>
                        </Menu.Target>
                        <Menu.Dropdown>
                            <Menu.Label>Show</Menu.Label>
                            <Menu.Item
                                onClick={() =>
                                    setFilters({ showExtra: !showExtra })
                                }
                                rightSection={
                                    showExtra ? (
                                        <MantineIcon
                                            icon={IconCheck}
                                            size={13}
                                        />
                                    ) : null
                                }
                                aria-checked={showExtra}
                                aria-label="Show extra modules"
                            >
                                Extra modules
                            </Menu.Item>
                            <Menu.Item
                                onClick={() =>
                                    setFilters({ showSoon: !showSoon })
                                }
                                rightSection={
                                    showSoon ? (
                                        <MantineIcon
                                            icon={IconCheck}
                                            size={13}
                                        />
                                    ) : null
                                }
                                aria-checked={showSoon}
                                aria-label="Coming soon"
                            >
                                Coming soon
                            </Menu.Item>
                        </Menu.Dropdown>
                    </Menu>
                    {ownCopy && (
                        <Tooltip
                            label="Open your copy of the training project, with what your lessons built"
                            withArrow
                            multiline
                            w={260}
                        >
                            <Button
                                variant="subtle"
                                color="gray"
                                size="compact-sm"
                                leftSection={
                                    <MantineIcon icon={IconCompass} size={14} />
                                }
                                onClick={() =>
                                    navigate(
                                        `/projects/${ownCopy.projectUuid}/home`,
                                    )
                                }
                                data-learn-explore
                            >
                                Continue exploring
                            </Button>
                        </Tooltip>
                    )}
                    {ownCopy && (
                        <Tooltip
                            label="Remove your copy of the training project; the next lesson starts from the beginning"
                            withArrow
                            multiline
                            w={260}
                        >
                            <Button
                                variant="subtle"
                                color="gray"
                                size="compact-sm"
                                leftSection={
                                    <MantineIcon icon={IconRotate} size={14} />
                                }
                                onClick={() => setConfirmingFresh(true)}
                                data-learn-start-fresh
                            >
                                Start fresh
                            </Button>
                        </Tooltip>
                    )}
                </Box>
                {trainingProject && ownCopy && confirmingFresh && (
                    <MantineModal
                        opened
                        onClose={() => setConfirmingFresh(false)}
                        title="Start fresh?"
                        role="alertdialog"
                        size="md"
                        description="Your copy and everything you built in it will be removed."
                        footer={
                            <Group justify="flex-end" w="100%">
                                <Button
                                    variant="subtle"
                                    color="gray"
                                    onClick={() => setConfirmingFresh(false)}
                                    disabled={startingFresh}
                                >
                                    Cancel
                                </Button>
                                <Button
                                    color="red"
                                    loading={startingFresh}
                                    onClick={() =>
                                        startFresh(
                                            {
                                                trainingProjectUuid:
                                                    trainingProject.projectUuid,
                                            },
                                            {
                                                onSuccess: () =>
                                                    setConfirmingFresh(false),
                                            },
                                        )
                                    }
                                >
                                    Start fresh
                                </Button>
                            </Group>
                        }
                    />
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
                                        note={accessNote(held, module)}
                                        opening={opening === module.scope}
                                        onStart={startFromCard}
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
