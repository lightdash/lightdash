import {
    assertUnreachable,
    type CiChecks,
    type SemanticStudioBranchCompile,
} from '@lightdash/common';
import {
    Box,
    Button,
    Group,
    Loader,
    Paper,
    Text,
    UnstyledButton,
} from '@mantine/core';
import {
    IconChevronDown,
    IconChevronRight,
    IconCircleCheck,
    IconCircleMinus,
    IconExternalLink,
    IconFileCode,
    IconGitBranch,
    IconInfoCircle,
    IconTable,
} from '@tabler/icons-react';
import { useContext, useState, type FC, type ReactNode } from 'react';
import { Link } from 'react-router';
import MantineIcon from '../../../../../../components/common/MantineIcon';
import {
    type ChangeKind,
    VIEW_PARAM,
} from '../../../../../../features/semanticStudio/modelCode';
import { ModelFieldChanges } from '../../../../../../features/semanticStudio/ModelFieldChanges';
import { TaskIcon } from '../../../../../../features/semanticStudio/TaskRow';
import { getSemanticStudioUrl } from '../../../../../../features/semanticStudio/urls';
import { useCheckoutCompile } from '../../../../../../features/semanticStudio/useStudioCheckout';
import { useStudioWorkspaces } from '../../../../../../features/semanticStudio/useStudioWorkspaces';
import {
    getModelOfFile,
    getModelsOfFiles,
    splitPatchIntoFiles,
    type DiffFile,
} from '../../../../../../features/writeback/splitPatch';
import { usePullRequestDiff } from '../../../../../../features/writeback/usePullRequestDiff';
import {
    getPullRequestNumber,
    isBitbucketPullRequest,
} from '../../ChatElements/ToolCalls/pullRequestCardUtils';
import { PullRequestCiChecks } from '../../ChatElements/ToolCalls/PullRequestCiChecks';
import { PullRequestViewMenu } from '../../ChatElements/ToolCalls/PullRequestViewMenu';
import { StudioAskContext } from '../../ChatElements/ToolCalls/studioChatContext';
import { WritebackDiffModal } from '../../ChatElements/ToolCalls/WritebackDiffModal';
import { resolveStudioPullRequestState } from '../studioPullRequestState';
import { useStudioPullRequest } from '../useStudioPullRequest';
import classes from './DbtTurnSummaryCard.module.css';
import { draftActions } from './turnActions';
import { TurnCard, type Safety, type TurnGroup } from './TurnCard';
import turnClasses from './TurnCard.module.css';

const FILE_ACTIONS: Record<ChangeKind, string> = {
    new: 'Added the file',
    changed: 'Changed the file',
    removed: 'Removed the file',
};

const changeOfFile = ({ patch, isNew }: DiffFile): ChangeKind => {
    if (isNew) return 'new';
    if (/^deleted file mode/m.test(patch)) return 'removed';
    return 'changed';
};

/** Whether the branch compiles, in one line with its reason. */
const getSafety = (
    compile: SemanticStudioBranchCompile | null,
): Safety | null => {
    if (!compile) return null;
    switch (compile.status) {
        case 'compiling':
            return { state: 'running', text: 'Compiling', why: null };
        case 'failed':
            return {
                state: 'failed',
                text: "Doesn't compile",
                why: compile.error,
            };
        case 'ready':
            return { state: 'done', text: 'Compiles', why: null };
        default:
            return assertUnreachable(compile.status, 'Unknown compile status');
    }
};

/** An open draft's latest turn, small: what it did to each model's fields, the one thing to confirm, and the rest on opening. */
const DraftTurnCard: FC<{
    projectUuid: string;
    models: string[];
    previewProjectUuid: string | null;
    cacheKey: string;
    note: string | null;
    safety: Safety | null;
    files: DiffFile[];
    changesUrl: string;
    actions: ReactNode[];
    children: ReactNode;
}> = ({
    projectUuid,
    models,
    previewProjectUuid,
    cacheKey,
    note,
    safety,
    files,
    changesUrl,
    actions,
    children,
}) => {
    const [isOpened, setIsOpened] = useState(false);
    const isFailing = safety?.state === 'failed';
    // A draft that does not compile shows why without being asked.
    const isOpen = isOpened || isFailing;
    return (
        <Paper mt="xs" className={turnClasses.card}>
            <UnstyledButton
                className={classes.compactHead}
                aria-expanded={isOpen}
                onClick={() => setIsOpened(!isOpened)}
            >
                {isFailing ? (
                    <TaskIcon state="failed" />
                ) : (
                    <Box className={turnClasses.dot} />
                )}
                <Text fz="xs" fw={500} flex="none">
                    {isFailing ? "Draft doesn't compile" : 'Draft'}
                </Text>
                <Text fz="xs" c="dimmed" truncate flex={1} miw={0}>
                    {models.join(', ')}
                </Text>
                {safety?.state === 'running' ? (
                    <Group gap={6} wrap="nowrap" flex="none">
                        <Loader size={10} color="gray" />
                        <Text fz="xs" c="dimmed">
                            {safety.text}
                        </Text>
                    </Group>
                ) : null}
                <MantineIcon
                    icon={isOpen ? IconChevronDown : IconChevronRight}
                    size={12}
                    color="dimmed"
                />
            </UnstyledButton>
            <Box className={classes.compactBody}>
                {models.map((model) => (
                    <ModelFieldChanges
                        key={model}
                        projectUuid={projectUuid}
                        model={model}
                        previewProjectUuid={previewProjectUuid}
                        cacheKey={cacheKey}
                        isCompiled={safety?.state === 'done'}
                    />
                ))}
                {note ? (
                    <Group gap={6} wrap="nowrap" align="flex-start">
                        <Box className={turnClasses.node} w={16}>
                            <MantineIcon
                                icon={IconInfoCircle}
                                size={14}
                                color="yellow"
                            />
                        </Box>
                        <Text
                            fz="xs"
                            c="dimmed"
                            lineClamp={isOpen ? undefined : 1}
                            title={note}
                        >
                            {note}
                        </Text>
                    </Group>
                ) : null}
                {isFailing && safety.why ? (
                    <Text fz="xs" c="dimmed" className={turnClasses.wrap}>
                        {safety.why}
                    </Text>
                ) : null}
            </Box>
            {isOpen ? (
                <>
                    {files.length > 0 ? (
                        <Box className={classes.compactBody}>
                            {files.map((file) => (
                                <UnstyledButton
                                    key={file.key}
                                    component={Link}
                                    to={changesUrl}
                                    className={turnClasses.row}
                                    title={file.path}
                                >
                                    <Text
                                        span
                                        fz="xs"
                                        c="dimmed"
                                        truncate
                                        className={turnClasses.label}
                                    >
                                        {file.path}
                                    </Text>
                                    <Text span fz="xs" c="dimmed" flex="none">
                                        +{file.additions} −{file.deletions}
                                    </Text>
                                </UnstyledButton>
                            ))}
                        </Box>
                    ) : null}
                    {children}
                    {actions.some(Boolean) ? (
                        <Group
                            className={classes.compactFoot}
                            gap="xs"
                            justify="flex-end"
                        >
                            {actions}
                        </Group>
                    ) : null}
                </>
            ) : null}
        </Paper>
    );
};

/** The end of an agent turn on a dbt project in Studio: the files it changed, whether they compile, and what to do next. */
export const DbtTurnSummaryCard: FC<{
    projectUuid: string;
    prUrl: string;
    /** The commit this turn pushed; null on turns saved before it was kept. */
    commitSha: string | null;
    previewUrl: string | null;
    /** Models this turn changed, shown until its files are read. */
    changedModels: string[];
    ciChecks: CiChecks | null;
    isLatestTurn: boolean;
    note: string | null;
}> = ({
    projectUuid,
    prUrl,
    commitSha,
    previewUrl,
    changedModels,
    ciChecks,
    isLatestTurn,
    note,
}) => {
    const onAsk = useContext(StudioAskContext);
    const isBitbucket = isBitbucketPullRequest(prUrl);
    const prNumber = getPullRequestNumber(prUrl);
    const [isDiffOpen, setIsDiffOpen] = useState(false);
    const pullRequest = useStudioPullRequest(projectUuid, null);
    const { data: workspaces } = useStudioWorkspaces(projectUuid);
    const compile = useCheckoutCompile(projectUuid, prUrl);
    const { data: diff } = usePullRequestDiff(
        projectUuid,
        prUrl,
        commitSha,
        !isBitbucket,
    );

    const draft = [
        ...(workspaces?.mine ?? []),
        ...(workspaces?.recent ?? []),
    ].find(({ pullRequest: pr }) => pr?.url === prUrl);
    const current = pullRequest?.prUrl === prUrl ? pullRequest : null;
    const state =
        current?.state ??
        resolveStudioPullRequestState(
            draft?.pullRequest?.state ?? null,
            ciChecks,
        );
    // Only the latest save of the draft you have checked out has a compile to follow.
    const latestCompile =
        current && current.commitSha === commitSha ? compile : null;
    const error =
        latestCompile?.status === 'failed'
            ? (latestCompile.error ?? 'the latest compile failed')
            : null;

    const studioUrl = getSemanticStudioUrl(projectUuid, { ref: null });
    const changesUrl = `${studioUrl}?${VIEW_PARAM}=changes`;
    const modelUrl = (model: string) =>
        getSemanticStudioUrl(projectUuid, {
            ref: { type: 'explore', exploreId: model },
        });
    const files = diff?.diff ? splitPatchIntoFiles(diff.diff) : [];
    const groups: TurnGroup[] =
        files.length > 0
            ? [...new Set(files.map(getModelOfFile))].map((model) => ({
                  model,
                  change: 'changed',
                  title: model,
                  subtitle: null,
                  issues: [],
                  rows: files
                      .filter((file) => getModelOfFile(file) === model)
                      .map((file) => {
                          const change = changeOfFile(file);
                          const isModel =
                              change !== 'removed' &&
                              getModelsOfFiles([file]).length > 0;
                          return {
                              id: file.key,
                              change,
                              action: FILE_ACTIONS[change],
                              icon: (
                                  <MantineIcon
                                      icon={IconFileCode}
                                      size={14}
                                      color="dimmed"
                                  />
                              ),
                              label: file.path.split('/').pop() ?? file.path,
                              detail: `+${file.additions} −${file.deletions}`,
                              title: file.path,
                              to: isModel ? modelUrl(model) : changesUrl,
                              // Once the draft is published or discarded, the turn's own diff is what is left to read.
                              onOpen:
                                  state === 'open'
                                      ? null
                                      : () => setIsDiffOpen(true),
                          };
                      }),
              }))
            : changedModels.map((model) => ({
                  model,
                  change: 'changed',
                  title: model,
                  subtitle: null,
                  issues: [],
                  rows: [
                      {
                          id: model,
                          change: 'changed',
                          action: 'Changed the model',
                          icon: (
                              <MantineIcon
                                  icon={IconTable}
                                  size={14}
                                  color="dimmed"
                              />
                          ),
                          label: model,
                          detail: null,
                          title: model,
                          to: modelUrl(model),
                          onOpen: null,
                      },
                  ],
              }));

    const actions = (() => {
        switch (state) {
            case 'open':
                return draftActions({ error, reviewTo: changesUrl, onAsk });
            case 'merged':
                return [
                    <Button
                        key="pr"
                        size="compact-xs"
                        variant="subtle"
                        component="a"
                        href={prUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        rightSection={
                            <MantineIcon icon={IconExternalLink} size={12} />
                        }
                    >
                        {prNumber ? `#${prNumber}` : 'Pull request'}
                    </Button>,
                    groups[0] ? (
                        <Button
                            key="open"
                            size="compact-xs"
                            variant="default"
                            component={Link}
                            to={modelUrl(groups[0].model)}
                        >
                            Open model
                        </Button>
                    ) : null,
                ];
            case 'closed':
                return [];
            default:
                return assertUnreachable(state, 'Unknown pull request state');
        }
    })();

    const header = (() => {
        switch (state) {
            case 'open':
                return error
                    ? {
                          icon: <TaskIcon state="failed" />,
                          status: "Draft doesn't compile",
                      }
                    : {
                          icon: <MantineIcon icon={IconGitBranch} size={14} />,
                          status: 'Draft',
                      };
            case 'merged':
                return {
                    icon: (
                        <MantineIcon
                            icon={IconCircleCheck}
                            size={14}
                            color="green"
                        />
                    ),
                    status: 'Merged',
                };
            case 'closed':
                return {
                    icon: (
                        <MantineIcon
                            icon={IconCircleMinus}
                            size={14}
                            color="ldGray.5"
                        />
                    ),
                    status: 'Discarded',
                };
            default:
                return assertUnreachable(state, 'Unknown pull request state');
        }
    })();

    const ciSection =
        state === 'open' && !isBitbucket && ciChecks?.checks.length ? (
            <Box className={turnClasses.section}>
                <PullRequestCiChecks
                    prUrl={prUrl}
                    ciChecks={ciChecks}
                    hasMergeAction
                />
            </Box>
        ) : null;
    if (state === 'open' && isLatestTurn) {
        return (
            <DraftTurnCard
                projectUuid={projectUuid}
                models={
                    groups.length > 0
                        ? groups.map(({ model }) => model)
                        : changedModels
                }
                previewProjectUuid={current?.previewProjectUuid ?? null}
                cacheKey={commitSha ?? prUrl}
                note={note}
                safety={getSafety(latestCompile)}
                files={files}
                changesUrl={changesUrl}
                actions={actions}
            >
                {ciSection}
            </DraftTurnCard>
        );
    }
    return (
        <>
            <TurnCard
                icon={header.icon}
                status={header.status}
                // The card sits in the conversation that made the draft, whose title already names it.
                headerAction={
                    // An open draft's links and discard are in the toolbar.
                    state === 'open' ? null : (
                        <PullRequestViewMenu
                            projectUuid={projectUuid}
                            prUrl={prUrl}
                            previewUrl={previewUrl}
                            commitSha={commitSha}
                        />
                    )
                }
                groups={groups}
                safety={state === 'open' ? getSafety(latestCompile) : null}
                isLatest={isLatestTurn}
                actions={actions}
                isGone={state === 'closed'}
                isFileList={files.length > 0}
            >
                {ciSection}
            </TurnCard>
            <WritebackDiffModal
                projectUuid={projectUuid}
                prUrl={prUrl}
                commitSha={commitSha}
                opened={isDiffOpen}
                onClose={() => setIsDiffOpen(false)}
            />
        </>
    );
};
