import { ProjectType, type HomepageLearnShow } from '@lightdash/common';
import {
    Badge,
    Button,
    MultiSelect,
    Progress,
    SegmentedControl,
    Stack,
    Text,
} from '@mantine/core';
import { IconCircleCheck, IconSchool } from '@tabler/icons-react';
import { type FC } from 'react';
import { Link } from 'react-router';
import MantineIcon from '../../../../components/common/MantineIcon';
import {
    GROUP_LABELS,
    isComplete,
    isNewRelease,
    isStarted,
    type LearnModule,
} from '../../../../features/learn/catalogue';
import {
    GROUP_ICONS,
    groupVars,
} from '../../../../features/learn/groupVisuals';
import {
    useLearnUpNext,
    type LearnUpNextState,
} from '../../../../features/learn/useLearnUpNext';
import { useStartWalkthrough } from '../../../../features/learn/useStartWalkthrough';
import { useProjects } from '../../../../hooks/useProjects';
import { useReportRuntimeEmpty } from '../hooks/useRuntimeEmptyBlocks';
import { BlockHeader } from './BlockShell';
import classes from './blockStyles.module.css';
import styles from './LearnBlock.module.css';
import { type BlockComponentProps, type BuildComponentProps } from './types';

const ProgressLine: FC<{ doneCount: number; total: number }> = ({
    doneCount,
    total,
}) => (
    <div
        className={styles.progress}
        data-learn-progress={`${doneCount}/${total}`}
    >
        <span>{`${doneCount} of ${total} complete`}</span>
        <Progress
            size="sm"
            radius="xl"
            color="indigo"
            value={total === 0 ? 0 : (doneCount / total) * 100}
            aria-label="Learn progress"
        />
    </div>
);

/** A link to the Learn library; a plain disabled button in the editor. */
const LibraryButton: FC<{
    to: string;
    interactive: boolean;
    variant: 'default' | 'subtle';
}> = ({ to, interactive, variant }) => {
    const color = variant === 'subtle' ? 'gray' : undefined;
    return interactive ? (
        <Button
            component={Link}
            to={to}
            variant={variant}
            color={color}
            size="compact-sm"
        >
            Open Learn
        </Button>
    ) : (
        <Button variant={variant} color={color} size="compact-sm" disabled>
            Open Learn
        </Button>
    );
};

type StartProps = {
    start: (scope: string, source: 'homepage') => void;
    opening: string | null;
};

/** The button a module offers, from the learner's own state. */
const startLabel = (done: boolean, started: boolean) =>
    done ? 'Start again' : started ? 'Resume' : 'Start';

const NewBadge: FC = () => (
    <Badge size="xs" variant="light" color="indigo" radius="sm">
        New
    </Badge>
);

/**
 * One module as the block's main card. `interactive` is false in the editor:
 * the builder sees their own state as a sample, but starting a walkthrough
 * from the editor would leave the draft behind.
 */
const ModuleCard: FC<
    {
        module: LearnModule;
        state: LearnUpNextState;
        projectUuid: string;
        interactive: boolean;
        isNew: boolean;
        dataAttr: 'data-learn-recommended' | 'data-learn-newest';
    } & StartProps
> = ({
    module,
    state,
    projectUuid,
    interactive,
    isNew,
    dataAttr,
    start,
    opening,
}) => {
    const done = isComplete(state.completed, module);
    const started = isStarted(state.started, module);
    return (
        <div
            className={styles.card}
            // oxlint-disable-next-line lightdash-ui/no-inline-style-prop
            style={groupVars(module.group)}
            {...{ [dataAttr]: module.scope }}
        >
            <span className={styles.tile}>
                <MantineIcon icon={GROUP_ICONS[module.group]} size={20} />
            </span>
            <div className={styles.body}>
                <span className={styles.overline}>
                    {isNew && <NewBadge />}
                    {`${GROUP_LABELS[module.group]} · ${module.stepCount} steps`}
                    {done && (
                        <span className={styles.done}>
                            <MantineIcon icon={IconCircleCheck} size={13} />
                            Complete
                        </span>
                    )}
                </span>
                <h3 className={styles.title}>{module.title}</h3>
                {module.blurb !== '' && (
                    <p className={styles.blurb}>{module.blurb}</p>
                )}
                <div className={styles.foot}>
                    <ProgressLine
                        doneCount={state.doneCount}
                        total={state.total}
                    />
                    <div className={styles.actions}>
                        <LibraryButton
                            to={`/projects/${projectUuid}/learn`}
                            interactive={interactive}
                            variant="subtle"
                        />
                        <Button
                            variant="filled"
                            color="indigo"
                            size="compact-sm"
                            disabled={!interactive}
                            loading={opening === module.scope}
                            onClick={() => start(module.scope, 'homepage')}
                        >
                            {startLabel(done, started)}
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
};

/** Every module finished: say so and point at the library. */
const FinishedCard: FC<{
    state: LearnUpNextState;
    projectUuid: string;
    interactive: boolean;
}> = ({ state, projectUuid, interactive }) => (
    <div className={styles.card} data-learn-finished>
        <span className={styles.tile}>
            <MantineIcon icon={IconCircleCheck} size={20} />
        </span>
        <div className={styles.body}>
            <h3 className={styles.title}>You have finished every module</h3>
            <p className={styles.blurb}>
                Open Learn to go over a module again, or to try one outside your
                role.
            </p>
            <div className={styles.foot}>
                <ProgressLine doneCount={state.doneCount} total={state.total} />
                <LibraryButton
                    to={`/projects/${projectUuid}/learn`}
                    interactive={interactive}
                    variant="default"
                />
            </div>
        </div>
    </div>
);

/**
 * The walkthroughs the data team featured (CS-242), in their order, each with
 * the learner's own state. A scope this instance cannot run, or that the
 * library no longer has, is skipped rather than shown as a dead card.
 */
const pinnedModules = (
    walkthroughs: LearnModule[],
    pinnedScopes: string[] | undefined,
): LearnModule[] =>
    (pinnedScopes ?? []).flatMap((scope) => {
        const module = walkthroughs.find((m) => m.scopes.includes(scope));
        return module ? [module] : [];
    });

/** A short list of modules under the main card, with a heading. */
const ModuleList: FC<
    {
        heading: string;
        modules: LearnModule[];
        state: LearnUpNextState;
        interactive: boolean;
        isNew: (module: LearnModule) => boolean;
        dataAttr: 'data-learn-pinned' | 'data-learn-also-new';
    } & StartProps
> = ({
    heading,
    modules,
    state,
    interactive,
    isNew,
    dataAttr,
    start,
    opening,
}) => {
    if (modules.length === 0) return null;
    return (
        <div className={styles.pinned} {...{ [dataAttr]: true }}>
            <span className={styles.overline}>{heading}</span>
            <div className={classes.listCard}>
                {modules.map((module) => {
                    const done = isComplete(state.completed, module);
                    const started = isStarted(state.started, module);
                    return (
                        <div
                            key={module.scope}
                            className={styles.pinnedRow}
                            // oxlint-disable-next-line lightdash-ui/no-inline-style-prop
                            style={groupVars(module.group)}
                            data-learn-module={module.scope}
                        >
                            <span className={styles.pinnedTile}>
                                <MantineIcon
                                    icon={GROUP_ICONS[module.group]}
                                    size={16}
                                />
                            </span>
                            <div className={styles.body}>
                                <span className={styles.pinnedTitle}>
                                    {module.title}
                                    {isNew(module) && <NewBadge />}
                                </span>
                                <span className={styles.pinnedMeta}>
                                    {done ? (
                                        <span className={styles.done}>
                                            <MantineIcon
                                                icon={IconCircleCheck}
                                                size={13}
                                            />
                                            Complete
                                        </span>
                                    ) : (
                                        `${module.stepCount} steps`
                                    )}
                                </span>
                            </div>
                            <Button
                                variant="default"
                                size="compact-sm"
                                disabled={!interactive}
                                loading={opening === module.scope}
                                onClick={() => start(module.scope, 'homepage')}
                            >
                                {startLabel(done, started)}
                            </Button>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

/**
 * The block's content, sharing one launcher. Up next leads with the
 * library's recommendation. Newest leads with the most recently released
 * module the viewer can do and lists the next newest under it; a viewer who
 * holds none of them gets Up next instead. The featured walkthroughs follow,
 * minus any module already shown.
 */
const LearnBody: FC<{
    state: LearnUpNextState;
    projectUuid: string;
    show: HomepageLearnShow;
    pinnedScopes: string[] | undefined;
    interactive: boolean;
}> = ({ state, projectUuid, show, pinnedScopes, interactive }) => {
    const { start, opening } = useStartWalkthrough(state.trainingProjectUuid);
    const startProps = { start, opening };
    const isNew = (module: LearnModule) =>
        isNewRelease(module, state.walkthroughs);
    const newest = show === 'newest' ? state.newest : [];
    const [hero, ...alsoNew] = newest;
    const shown = new Set(
        hero
            ? newest.map((module) => module.scope)
            : state.upNext
              ? [state.upNext.module.scope]
              : [],
    );
    return (
        <Stack gap="sm">
            {hero ? (
                <ModuleCard
                    module={hero}
                    state={state}
                    projectUuid={projectUuid}
                    interactive={interactive}
                    isNew={isNew(hero)}
                    dataAttr="data-learn-newest"
                    {...startProps}
                />
            ) : state.upNext ? (
                <ModuleCard
                    module={state.upNext.module}
                    state={state}
                    projectUuid={projectUuid}
                    interactive={interactive}
                    isNew={false}
                    dataAttr="data-learn-recommended"
                    {...startProps}
                />
            ) : (
                <FinishedCard
                    state={state}
                    projectUuid={projectUuid}
                    interactive={interactive}
                />
            )}
            <ModuleList
                heading="Also new"
                modules={alsoNew}
                state={state}
                interactive={interactive}
                isNew={isNew}
                dataAttr="data-learn-also-new"
                {...startProps}
            />
            <ModuleList
                heading="Picked by your data team"
                modules={pinnedModules(state.walkthroughs, pinnedScopes).filter(
                    (module) => !shown.has(module.scope),
                )}
                state={state}
                interactive={interactive}
                isNew={() => false}
                dataAttr="data-learn-pinned"
                {...startProps}
            />
        </Stack>
    );
};

/**
 * Why a viewer would see nothing: they cannot see Learn, the organization
 * has not enabled it, the instance runs no module, or this is a training
 * copy or the training project itself (walkthroughs run there; they are not
 * advertised there). Null when the card shows.
 */
const useHiddenReason = (
    state: LearnUpNextState,
    projectUuid: string,
): 'no-access' | 'not-enabled' | 'training' | null => {
    const { data: projects } = useProjects();
    const current = projects?.find(
        (project) => project.projectUuid === projectUuid,
    );
    if (!state.canViewLearn) return 'no-access';
    if (
        current?.type === ProjectType.PREVIEW ||
        current?.type === ProjectType.TRAINING
    )
        return 'training';
    if (state.isSettled && (!state.trainingProjectUuid || state.total === 0))
        return 'not-enabled';
    return null;
};

export const LearnBlockView: FC<BlockComponentProps> = ({
    block,
    projectUuid,
}) => {
    const state = useLearnUpNext();
    const hidden = useHiddenReason(state, projectUuid);
    // Until every input answers the card stays out, so it never shows one
    // module and then swaps to another; a hidden card collapses its row.
    useReportRuntimeEmpty(block.id, hidden !== null, !state.isSettled);
    if (block.type !== 'learn' || hidden || !state.isSettled) return null;
    return (
        <Stack gap={0} data-homepage-block="learn">
            {/* "Personal per viewer" is for the editor; a viewer just sees
                their own card. */}
            <BlockHeader icon={IconSchool} title={block.config.title} />
            <LearnBody
                state={state}
                projectUuid={projectUuid}
                show={block.config.show ?? 'up-next'}
                pinnedScopes={block.config.pinnedScopes}
                interactive
            />
        </Stack>
    );
};

const HIDDEN_HINTS: Record<
    NonNullable<ReturnType<typeof useHiddenReason>>,
    string
> = {
    'no-access':
        'You cannot see Learn, so there is no sample to show. Viewers who can see Learn get their next module here.',
    'not-enabled':
        'Learn is not enabled for this organization yet, so viewers will not see this block. An admin can enable it from the Learn page.',
    training:
        'Learn is not offered on the training project or inside a training copy, so viewers will not see this block here.',
};

export const LearnBlockBuild: FC<BuildComponentProps> = ({
    block,
    projectUuid,
    onChange,
}) => {
    const state = useLearnUpNext();
    const hidden = useHiddenReason(state, projectUuid);
    if (block.type !== 'learn') return null;
    const show = block.config.show ?? 'up-next';
    return (
        <Stack gap={0}>
            <BlockHeader
                icon={IconSchool}
                title={block.config.title}
                pill="Personal per viewer"
            />
            {hidden ? (
                <div className={classes.dashedEmpty}>
                    {HIDDEN_HINTS[hidden]}
                </div>
            ) : state.isSettled ? (
                <>
                    <LearnBody
                        state={state}
                        projectUuid={projectUuid}
                        show={show}
                        pinnedScopes={block.config.pinnedScopes}
                        interactive={false}
                    />
                    <div className={classes.buildHint}>
                        {show === 'newest'
                            ? 'Showing the newest modules you can do, as a sample. Every viewer sees the newest ones they can do, or their next module if there are none, and the block hides for anyone who cannot use Learn.'
                            : 'Showing your own progress as a sample. Every viewer sees their own next module, and the block hides for anyone who cannot use Learn.'}
                    </div>
                    <Stack gap={4} mt="sm">
                        <Text size="xs" fw={500}>
                            Show
                        </Text>
                        <SegmentedControl
                            size="xs"
                            value={show}
                            onChange={(next) =>
                                onChange({
                                    ...block,
                                    config: {
                                        ...block.config,
                                        show: next as HomepageLearnShow,
                                    },
                                })
                            }
                            data={[
                                {
                                    value: 'up-next',
                                    label: 'Up next for each viewer',
                                },
                                { value: 'newest', label: 'Newest modules' },
                            ]}
                        />
                    </Stack>
                    <MultiSelect
                        mt="sm"
                        size="xs"
                        label="Featured walkthroughs"
                        description="Optional. Listed under the main card, in this order, for everyone who sees the block."
                        placeholder="Search walkthroughs"
                        searchable
                        clearable
                        data={state.walkthroughs.map((module) => ({
                            value: module.scope,
                            label: module.title,
                        }))}
                        value={pinnedModules(
                            state.walkthroughs,
                            block.config.pinnedScopes,
                        ).map((module) => module.scope)}
                        onChange={(scopes) =>
                            onChange({
                                ...block,
                                config: {
                                    ...block.config,
                                    pinnedScopes:
                                        scopes.length > 0 ? scopes : undefined,
                                },
                            })
                        }
                    />
                </>
            ) : null}
        </Stack>
    );
};
