import {
    assertUnreachable,
    type CiChecks,
    type SemanticStudioBranchCompile,
} from '@lightdash/common';
import { Box, Button } from '@mantine/core';
import {
    IconCircleCheck,
    IconCircleMinus,
    IconGitBranch,
    IconGitPullRequest,
} from '@tabler/icons-react';
import { useContext, useState, type FC } from 'react';
import { Link } from 'react-router';
import MantineIcon from '../../../../../../components/common/MantineIcon';
import {
    type ChangeKind,
    VIEW_PARAM,
} from '../../../../../../features/semanticStudio/modelCode';
import {
    Task,
    TaskIcon,
} from '../../../../../../features/semanticStudio/TaskRow';
import {
    draftActions,
    draftSteps,
    type Trial,
} from '../../../../../../features/semanticStudio/turnActions';
import {
    TurnCard,
    type Safety,
    type TurnGroup,
} from '../../../../../../features/semanticStudio/TurnCard';
import classes from '../../../../../../features/semanticStudio/TurnSummaryCard.module.css';
import { getSemanticStudioUrl } from '../../../../../../features/semanticStudio/urls';
import { useDraftCheckout } from '../../../../../../features/semanticStudio/useSemanticLayerModel';
import { useStudioWorkspaces } from '../../../../../../features/semanticStudio/useStudioWorkspaces';
import { useClosePullRequest } from '../../../hooks/useClosePullRequest';
import { usePullRequestDiff } from '../../../hooks/usePullRequestDiff';
import { PublishDraftModal } from '../../SemanticStudioAgent/PublishDraftModal';
import { resolveStudioPullRequestState } from '../../SemanticStudioAgent/studioPullRequestState';
import { TryIt } from '../../SemanticStudioAgent/TryItButton';
import { useStudioPublish } from '../../SemanticStudioAgent/useStudioPublish';
import { useStudioPullRequest } from '../../SemanticStudioAgent/useStudioPullRequest';
import { isBitbucketPullRequest } from './pullRequestCardUtils';
import { PullRequestCiChecks } from './PullRequestCiChecks';
import {
    OpenPullRequestMenuItems,
    PullRequestViewMenu,
} from './PullRequestViewMenu';
import { StudioAskContext } from './quietCards';
import {
    getModelOfFile,
    getModelsOfFiles,
    splitPatchIntoFiles,
    type DiffFile,
} from './splitPatch';

const FILE_KINDS: Record<string, string> = {
    yml: 'YAML',
    yaml: 'YAML',
    sql: 'SQL',
};

const changeOfFile = ({ patch }: DiffFile): ChangeKind => {
    if (/^new file mode/m.test(patch)) return 'new';
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
}> = ({
    projectUuid,
    prUrl,
    commitSha,
    previewUrl,
    changedModels,
    ciChecks,
}) => {
    const onAsk = useContext(StudioAskContext);
    const isBitbucket = isBitbucketPullRequest(prUrl);
    const pullRequest = useStudioPullRequest(projectUuid);
    const { data: workspaces } = useStudioWorkspaces(projectUuid);
    const { data: checkout } = useDraftCheckout(projectUuid);
    const { data: diff } = usePullRequestDiff(
        projectUuid,
        prUrl,
        commitSha,
        !isBitbucket,
    );
    const { destination, compile, blocker } = useStudioPublish(
        projectUuid,
        prUrl,
        ciChecks,
    );
    const { mutate: close } = useClosePullRequest(projectUuid);
    const [trial, setTrial] = useState<Trial>('idle');
    const [publishing, setPublishing] = useState(false);

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
    const isLatest =
        !!current &&
        current.commitSha === commitSha &&
        !!draft &&
        checkout?.workspaceUuid === draft.workspaceUuid;
    const latestCompile = isLatest ? compile : null;
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
                              kind:
                                  FILE_KINDS[
                                      file.path.split('.').pop() ?? ''
                                  ] ?? 'File',
                              label: file.path.split('/').pop() ?? file.path,
                              detail: `+${file.additions} −${file.deletions}`,
                              title: file.path,
                              to: isModel ? modelUrl(model) : changesUrl,
                          };
                      }),
              }))
            : changedModels.map((model) => ({
                  model,
                  title: model,
                  subtitle: null,
                  issues: [],
                  rows: [
                      {
                          id: model,
                          change: 'changed',
                          kind: 'Model',
                          label: model,
                          detail: null,
                          title: model,
                          to: modelUrl(model),
                      },
                  ],
              }));

    const tryModels = current?.changedModels ?? [];
    // Without its preview, a teammate's change would be tried as your own changes, or as live.
    const canTry =
        !!current &&
        tryModels.length > 0 &&
        (current.isMine || !!current.previewProjectUuid) &&
        latestCompile?.status !== 'compiling';

    const actions = (() => {
        switch (state) {
            case 'open':
                return draftActions({
                    error,
                    isBusy: latestCompile?.status === 'compiling',
                    trial,
                    canTry,
                    canPublish: isLatest && !!current?.isMine && !blocker,
                    publishLabel: 'Publish',
                    reviewTo: changesUrl,
                    onAsk,
                    onTry: () => setTrial('trying'),
                    onPublish: () => setPublishing(true),
                });
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
                        leftSection={
                            <MantineIcon icon={IconGitPullRequest} size={12} />
                        }
                    >
                        View pull request
                    </Button>,
                    groups[0] ? (
                        <Button
                            key="open"
                            size="compact-xs"
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

    const steps = (() => {
        switch (state) {
            case 'open':
                return draftSteps({
                    failed: error !== null,
                    trial,
                    publishLabel: 'Publish',
                });
            case 'merged':
                return [
                    <Task key="draft" state="done" label="In your draft" />,
                    <Task key="publish" state="done" label="Merged" />,
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

    return (
        <TurnCard
            icon={header.icon}
            status={header.status}
            name={draft?.name ?? null}
            headerAction={
                <PullRequestViewMenu
                    projectUuid={projectUuid}
                    prUrl={prUrl}
                    previewUrl={previewUrl}
                    commitSha={commitSha}
                >
                    {state === 'open' && !isBitbucket ? (
                        <OpenPullRequestMenuItems
                            projectUuid={projectUuid}
                            isGithub={prUrl.startsWith('https://github.com/')}
                            onClose={(onClosed) =>
                                close({ prUrl }, { onSuccess: onClosed })
                            }
                        />
                    ) : null}
                </PullRequestViewMenu>
            }
            groups={groups}
            safety={state === 'open' ? getSafety(latestCompile) : null}
            steps={steps}
            actions={actions}
            isSettled={state !== 'open'}
            isGone={state === 'closed'}
        >
            {state === 'open' && !isBitbucket && ciChecks?.checks.length ? (
                <Box className={classes.section}>
                    <PullRequestCiChecks
                        prUrl={prUrl}
                        ciChecks={ciChecks}
                        hasMergeAction
                    />
                </Box>
            ) : null}
            {trial === 'trying' && current ? (
                <TryIt
                    projectUuid={projectUuid}
                    models={tryModels}
                    previewProjectUuid={current.previewProjectUuid}
                    prUrl={prUrl}
                    onClose={() => setTrial('tried')}
                />
            ) : null}
            {publishing ? (
                <PublishDraftModal
                    projectUuid={projectUuid}
                    prUrl={prUrl}
                    destination={destination}
                    onClose={() => setPublishing(false)}
                />
            ) : null}
        </TurnCard>
    );
};
