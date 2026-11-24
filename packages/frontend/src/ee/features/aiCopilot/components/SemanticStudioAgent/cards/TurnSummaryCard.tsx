import {
    assertUnreachable,
    getDraftChangeUuids,
    getProposalPhase,
    type SemanticLayerDraft,
    type SemanticLayerDraftImpact,
    type SemanticLayerProposal,
} from '@lightdash/common';
import { Button, Tooltip } from '@mantine/core';
import {
    IconAlertTriangle,
    IconArrowsJoin,
    IconCircleCheck,
    IconCircleMinus,
    IconGitBranch,
    IconGitPullRequest,
    IconTable,
} from '@tabler/icons-react';
import { lazy, Suspense, useState, type FC } from 'react';
import { Link } from 'react-router';
import MantineIcon from '../../../../../../components/common/MantineIcon';
import { cannotApply } from '../../../../../../features/semanticStudio/draftState';
import { FieldChangeIcon } from '../../../../../../features/semanticStudio/KindTypeIcon';
import {
    MetricPreview,
    type MetricPreviewModel,
} from '../../../../../../features/semanticStudio/MetricPreview';
import {
    describeModelChange,
    DRAFT_PARAM,
    DRAFT_REVIEW,
    getChangeKind,
    type ChangeKind,
    getModelCodeSearch,
    listFieldChanges,
    type FieldChange,
    VIEW_PARAM,
    type WholeModelChange,
} from '../../../../../../features/semanticStudio/modelCode';
import { TaskIcon } from '../../../../../../features/semanticStudio/TaskRow';
import { getSemanticStudioUrl } from '../../../../../../features/semanticStudio/urls';
import {
    usePublishMode,
    useSemanticLayerDraft,
    useSemanticLayerDraftImpact,
} from '../../../../../../features/semanticStudio/useSemanticLayerModel';
import { useDraftPullRequest } from '../../../../../../features/semanticStudio/useStudioCheckout';
import {
    AGENT_WORKING_HINT,
    useStudioAgentWorking,
} from '../useSemanticStudioChat';
import { listTurnIssues } from './proposalIssues';
import { draftActions, fixFailureAction } from './turnActions';
import { TurnCard, type Safety } from './TurnCard';
import { useRefreshUnknownDraftChanges } from './useRefreshUnknownDraftChanges';

// The review and its diff viewer stay out of the chat's bundle until someone publishes from a card.
const ApplyModal = lazy(() =>
    import('../../../../../../features/semanticStudio/SemanticLayerDraft').then(
        (module) => ({
            default: module.ApplyModal,
        }),
    ),
);

/** What was done to a part of a model, as the start of a sentence its name ends. */
const ACTIONS: Record<FieldChange['kind'], Record<ChangeKind, string>> = {
    dimension: {
        new: 'Added the dimension',
        changed: 'Changed the dimension',
        removed: 'Removed the dimension',
    },
    metric: {
        new: 'Added the metric',
        changed: 'Changed the metric',
        removed: 'Removed the metric',
    },
    join: {
        new: 'Joined to',
        changed: 'Changed the join to',
        removed: 'Removed the join to',
    },
    model: { new: 'Added', changed: 'Changed', removed: 'Removed' },
};

/** A whole model's change as a sentence under its name: "Created with 12 dimensions and 1 metric". */
const describeWholeModel = (whole: WholeModelChange | null): string | null => {
    if (whole === null) return null;
    return whole.kind === 'removed'
        ? 'Removed from the layer'
        : `Created with ${whole.counts.join(' and ')}`;
};

type ModelGroup = {
    model: string;
    change: ChangeKind;
    title: string;
    subtitle: string | null;
    removed: boolean;
    fields: FieldChange[];
};

/** Every model the turn touched, with its fields; a part changed in two proposals reads once. */
const groupByModel = (proposals: SemanticLayerProposal[]): ModelGroup[] => {
    const models = [
        ...new Set(proposals.flatMap((p) => p.models.map((m) => m.model))),
    ];
    return models.map((model) => {
        const diffs = proposals.flatMap(({ diffs: all }) =>
            all.filter((diff) => diff.model === model),
        );
        const fields = new Map<string, FieldChange>();
        proposals.forEach(({ models: entries, diffs: all }) => {
            const entry = entries.find((m) => m.model === model);
            const diff = all.find((d) => d.model === model);
            if (!entry || entry.status !== 'ready' || !diff) return;
            listFieldChanges(model, entry.changes, diff).forEach((field) => {
                const id = `${field.kind}:${field.name}`;
                const earlier = fields.get(id);
                fields.set(id, {
                    ...field,
                    change:
                        earlier?.change === 'new' && field.change !== 'removed'
                            ? 'new'
                            : field.change,
                });
            });
        });
        const span =
            diffs.length > 0
                ? {
                      contentBefore: diffs[0].contentBefore,
                      contentAfter: diffs[diffs.length - 1].contentAfter,
                  }
                : null;
        const { title, whole } = describeModelChange(model, span);
        return {
            model,
            title,
            subtitle: describeWholeModel(whole),
            change: span === null ? 'changed' : getChangeKind(span),
            removed: span !== null && getChangeKind(span) === 'removed',
            // A new model's subtitle already counts what it was created with.
            fields:
                span !== null && getChangeKind(span) === 'new'
                    ? []
                    : [...fields.values()],
        };
    });
};

type Phase =
    | { kind: 'draft'; error: string | null }
    | { kind: 'published'; model: string | null }
    | { kind: 'pull_request'; url: string }
    | { kind: 'gone'; label: string }
    | { kind: 'loading' }
    | { kind: 'none' };

const getPhase = (
    draft: SemanticLayerDraft | undefined,
    uuids: string[],
    groups: ModelGroup[],
): Phase => {
    if (uuids.length === 0) return { kind: 'none' };
    if (!draft) return { kind: 'loading' };
    const phase = getProposalPhase(draft, uuids, {
        pullRequestFrom: 'latest_applied',
    });
    switch (phase.kind) {
        case 'in_draft': {
            const models = groups.map(({ model }) => model);
            const error =
                phase.changes
                    .flatMap((change) => change.models)
                    .find((entry) => entry.error !== null)?.error ??
                draft.errors.find((entry) => models.includes(entry.model))
                    ?.message ??
                null;
            return { kind: 'draft', error };
        }
        case 'pull_request':
            return { kind: 'pull_request', url: phase.url };
        case 'applied': {
            const open = groups.find(({ removed }) => !removed)?.model;
            return { kind: 'published', model: open ?? null };
        }
        // Not in the draft as read yet: the agent added it after the last read.
        case 'unknown':
            return { kind: 'loading' };
        case 'undone':
            return { kind: 'gone', label: 'Undone' };
        case 'discarded':
            return { kind: 'gone', label: 'Discarded' };
        default:
            return assertUnreachable(phase, 'Unknown proposal phase');
    }
};

/** Whether the draft is safe to try, in one line with its reason. */
const getSafety = (
    error: string | null,
    impact: SemanticLayerDraftImpact | undefined,
    conflicts: number,
): Safety => {
    if (error) return { state: 'failed', text: "Doesn't compile", why: error };
    if (conflicts > 0) {
        return {
            state: 'failed',
            text: `${conflicts} ${conflicts === 1 ? 'conflict' : 'conflicts'}`,
            why: 'choose a version',
        };
    }
    if (!impact) {
        return { state: 'running', text: 'Checking saved charts', why: null };
    }
    switch (impact.status) {
        case 'checking':
            return {
                state: 'running',
                text: 'Checking saved charts',
                why: null,
            };
        case 'unchecked':
            return {
                state: 'todo',
                text: 'Compiles',
                why: 'saved charts not checked yet',
            };
        case 'failed':
            return {
                state: 'todo',
                text: 'Compiles',
                why: "couldn't check saved charts",
            };
        case 'done': {
            const breaks = impact.breaks.length;
            return breaks > 0
                ? {
                      state: 'failed',
                      text: `${breaks} saved ${breaks === 1 ? 'chart or dashboard stops' : 'charts or dashboards stop'} working`,
                      why: null,
                  }
                : {
                      state: 'done',
                      text: 'Safe to try',
                      why: 'compiles, no saved chart breaks',
                  };
        }
        default:
            return assertUnreachable(impact.status, 'Unknown impact status');
    }
};

/** The end of an agent turn in Studio: what changed in semantic terms, whether it is safe, and what to do next. */
export const TurnSummaryCard: FC<{
    projectUuid: string;
    proposals: SemanticLayerProposal[];
    /** Asks the agent in this chat; null while it is busy. */
    onAsk: ((message: string) => void) | null;
    isLatest: boolean;
}> = ({ projectUuid, proposals, onAsk, isLatest }) => {
    const { data: draft } = useSemanticLayerDraft(projectUuid);
    const { data: impact } = useSemanticLayerDraftImpact(projectUuid, null);
    const uuids = getDraftChangeUuids(proposals);
    const groups = groupByModel(proposals);
    const phase = getPhase(draft, uuids, groups);
    useRefreshUnknownDraftChanges(projectUuid, draft, uuids);

    const studioUrl = getSemanticStudioUrl(projectUuid, { ref: null });
    const reviewUrl = `${studioUrl}?${DRAFT_PARAM}=${DRAFT_REVIEW}`;
    const modelUrl = (model: string) =>
        getSemanticStudioUrl(projectUuid, {
            ref: { type: 'explore', exploreId: model },
        });
    const fieldUrl = (model: string, field: FieldChange) => {
        if (field.change === 'removed') return reviewUrl;
        if (field.kind === 'dimension' || field.kind === 'metric') {
            return `${modelUrl(model)}?${getModelCodeSearch(field.name)}`;
        }
        return modelUrl(model);
    };
    const issues = listTurnIssues(proposals);
    // The latest clean draft shows its metrics working, so trying it needs no Explore.
    const previews: MetricPreviewModel[] =
        isLatest && phase.kind === 'draft' && !phase.error
            ? groups.flatMap(
                  ({
                      model,
                      change,
                      removed,
                      fields,
                  }): MetricPreviewModel[] => {
                      if (removed) return [];
                      if (change === 'new') {
                          return [{ model, isNew: true, metrics: null }];
                      }
                      const metrics = fields
                          .filter(
                              (field) =>
                                  field.kind === 'metric' &&
                                  field.change !== 'removed',
                          )
                          .map(({ name, change: kind }) => ({
                              name,
                              isNew: kind === 'new',
                          }));
                      return metrics.length > 0
                          ? [{ model, isNew: false, metrics }]
                          : [];
                  },
              )
            : [];
    const isDraft = phase.kind === 'draft';
    const conflicts = (draft?.models ?? []).filter(
        ({ reconciliation }) => reconciliation?.state === 'conflict',
    ).length;
    const safety = isDraft ? getSafety(phase.error, impact, conflicts) : null;
    const [publishing, setPublishing] = useState(false);
    const publishMode = usePublishMode(projectUuid);
    const asPullRequest = publishMode === 'pull_request';
    // With no repository the change reads as the models it touches; code is one tab away.
    const changesUrl =
        publishMode !== 'live'
            ? reviewUrl
            : groups.length === 1
              ? modelUrl(groups[0].model)
              : `${studioUrl}?${VIEW_PARAM}=models`;
    const isSent = useDraftPullRequest() !== null;
    const isAgentWorking = useStudioAgentWorking(projectUuid);
    // A clean draft can go out from where it was made, as the toolbar's button would send it.
    const canPublish =
        safety?.state === 'done' &&
        !!draft &&
        !cannotApply(draft, null) &&
        !issues.some(({ kind }) => kind === 'failed');
    const publishLabel = isSent ? 'Update pull request' : 'Open pull request';
    // A model the agent could not add, and did not go on to fix, is one more thing to hand back to it.
    const fixFailure = fixFailureAction(issues, onAsk);
    const actions = (() => {
        switch (phase.kind) {
            case 'draft':
                return [
                    ...draftActions({
                        error: phase.error,
                        reviewTo: changesUrl,
                        onAsk,
                    }),
                    phase.error ? null : fixFailure,
                    canPublish ? (
                        <Tooltip
                            key="publish"
                            label={AGENT_WORKING_HINT}
                            disabled={!isAgentWorking}
                            events={{ hover: true, focus: true, touch: false }}
                        >
                            <Button
                                size="compact-xs"
                                data-disabled={isAgentWorking || undefined}
                                aria-disabled={isAgentWorking}
                                onClick={() => {
                                    if (!isAgentWorking) setPublishing(true);
                                }}
                            >
                                {asPullRequest ? publishLabel : 'Publish'}
                            </Button>
                        </Tooltip>
                    ) : null,
                ];
            case 'published':
                return phase.model
                    ? [
                          <Button
                              key="open"
                              size="compact-xs"
                              component={Link}
                              to={modelUrl(phase.model)}
                          >
                              Open model
                          </Button>,
                      ]
                    : [];
            case 'pull_request':
                return [
                    <Button
                        key="pr"
                        size="compact-xs"
                        component="a"
                        href={phase.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        leftSection={
                            <MantineIcon icon={IconGitPullRequest} size={12} />
                        }
                    >
                        View pull request
                    </Button>,
                ];
            case 'none':
                return [fixFailure];
            case 'gone':
            case 'loading':
                return [];
            default:
                return assertUnreachable(phase, 'Unknown turn phase');
        }
    })();

    const header = (() => {
        switch (phase.kind) {
            case 'loading':
                return {
                    icon: <MantineIcon icon={IconGitBranch} size={14} />,
                    status: 'Draft',
                };
            case 'draft':
                return phase.error
                    ? {
                          icon: <TaskIcon state="failed" />,
                          status: "Draft doesn't compile",
                      }
                    : { icon: null, status: 'Drafted' };
            case 'published':
                return {
                    icon: (
                        <MantineIcon
                            icon={IconCircleCheck}
                            size={14}
                            color="green"
                        />
                    ),
                    status: 'Published',
                };
            case 'pull_request':
                return {
                    icon: (
                        <MantineIcon
                            icon={IconCircleCheck}
                            size={14}
                            color="green"
                        />
                    ),
                    status: 'Pull request opened',
                };
            case 'gone':
                return {
                    icon: (
                        <MantineIcon
                            icon={IconCircleMinus}
                            size={14}
                            color="ldGray.5"
                        />
                    ),
                    status: phase.label,
                };
            case 'none':
                return {
                    icon: (
                        <MantineIcon
                            icon={IconAlertTriangle}
                            size={14}
                            color="yellow"
                        />
                    ),
                    status: 'Nothing changed',
                };
            default:
                return assertUnreachable(phase, 'Unknown turn phase');
        }
    })();

    return (
        <TurnCard
            icon={header.icon}
            status={header.status}
            headerAction={null}
            groups={groups.map(
                ({ model, change, title, subtitle, fields }) => ({
                    model,
                    change,
                    title,
                    subtitle,
                    rows: fields.map((field) => ({
                        id: `${field.kind}:${field.name}`,
                        change: field.change,
                        action: ACTIONS[field.kind][field.change],
                        // A field keeps the Explorer's own icon and colour; a join is blue and a table green.
                        icon:
                            field.kind === 'dimension' ||
                            field.kind === 'metric' ? (
                                <FieldChangeIcon field={field} />
                            ) : field.kind === 'join' ? (
                                <MantineIcon
                                    icon={IconArrowsJoin}
                                    size={14}
                                    color="blue"
                                />
                            ) : (
                                <MantineIcon
                                    icon={IconTable}
                                    size={14}
                                    color="green"
                                />
                            ),
                        label: (() => {
                            // A model's own keys have no name of their own to show.
                            if (field.kind === 'model') {
                                return `its ${field.detail ?? 'settings'}`;
                            }
                            // A join to a model this turn touched reads by that model's name.
                            if (field.kind === 'join') {
                                return (
                                    groups.find((g) => g.model === field.name)
                                        ?.title ?? field.label
                                );
                            }
                            return field.label;
                        })(),
                        // How it is defined waits on hover and in the review; the card names what changed.
                        detail: null,
                        title: [field.name, field.detail]
                            .filter(Boolean)
                            .join(' · '),
                        to: fieldUrl(model, field),
                        onOpen: null,
                    })),
                    issues: issues.filter((issue) => issue.model === model),
                }),
            )}
            safety={safety}
            isLatest={isLatest}
            actions={actions}
            preview={
                previews.length > 0 && draft ? (
                    <MetricPreview
                        projectUuid={projectUuid}
                        models={previews}
                        cacheKey={draft.changes
                            .map(({ draftChangeUuid }) => draftChangeUuid)
                            .join()}
                    />
                ) : null
            }
            isGone={phase.kind === 'gone'}
            isSettled={
                phase.kind === 'published' ||
                phase.kind === 'pull_request' ||
                phase.kind === 'gone'
            }
        >
            {publishing && draft ? (
                <Suspense fallback={null}>
                    <ApplyModal
                        projectUuid={projectUuid}
                        draft={draft}
                        model={null}
                        onClose={() => setPublishing(false)}
                    />
                </Suspense>
            ) : null}
        </TurnCard>
    );
};
