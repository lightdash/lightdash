import {
    assertUnreachable,
    type CiChecks,
    type SemanticStudioBranchCompile,
} from '@lightdash/common';
import { Box, Button } from '@mantine/core';
import {
    IconCircleCheck,
    IconCircleMinus,
    IconFileCode,
    IconGitBranch,
    IconGitPullRequest,
    IconTable,
} from '@tabler/icons-react';
import { useContext, type FC } from 'react';
import { Link } from 'react-router';
import MantineIcon from '../../../../../../components/common/MantineIcon';
import {
    type ChangeKind,
    VIEW_PARAM,
} from '../../../../../../features/semanticStudio/modelCode';
import { TaskIcon } from '../../../../../../features/semanticStudio/TaskRow';
import { draftActions } from '../../../../../../features/semanticStudio/turnActions';
import {
    TurnCard,
    type Safety,
    type TurnGroup,
} from '../../../../../../features/semanticStudio/TurnCard';
import classes from '../../../../../../features/semanticStudio/TurnSummaryCard.module.css';
import { getSemanticStudioUrl } from '../../../../../../features/semanticStudio/urls';
import { useDraftCheckout } from '../../../../../../features/semanticStudio/useSemanticLayerModel';
import { useStudioWorkspaces } from '../../../../../../features/semanticStudio/useStudioWorkspaces';
import { usePullRequestDiff } from '../../../hooks/usePullRequestDiff';
import { resolveStudioPullRequestState } from '../../SemanticStudioAgent/studioPullRequestState';
import { useStudioPublish } from '../../SemanticStudioAgent/useStudioPublish';
import { useStudioPullRequest } from '../../SemanticStudioAgent/useStudioPullRequest';
import { isBitbucketPullRequest } from './pullRequestCardUtils';
import { PullRequestCiChecks } from './PullRequestCiChecks';
import { PullRequestViewMenu } from './PullRequestViewMenu';
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
    isLatestTurn: boolean;
    note: string | null;
    options: string[];
}> = ({
    projectUuid,
    prUrl,
    commitSha,
    previewUrl,
    changedModels,
    ciChecks,
    isLatestTurn,
    note,
    options,
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
    const { compile } = useStudioPublish(projectUuid, prUrl, ciChecks);

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
                              icon: (
                                  <MantineIcon
                                      icon={IconFileCode}
                                      color="dimmed"
                                  />
                              ),
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
                          icon: <MantineIcon icon={IconTable} color="dimmed" />,
                          label: model,
                          detail: null,
                          title: model,
                          to: modelUrl(model),
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
            note={state === 'open' ? note : null}
            options={state === 'open' ? options : []}
            onAsk={onAsk}
            isLatest={isLatestTurn}
            actions={actions}
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
        </TurnCard>
    );
};
