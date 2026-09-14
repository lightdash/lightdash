import {
    getErrorMessage,
    type AiAgentReviewItemSummary,
    type AiAgentTargetRef,
    type AiReviewJiraDestination,
    type CreateReviewJiraIssuePayload,
} from '@lightdash/common'; // pragma: allowlist secret
import { type LightdashAnalytics } from '../../../analytics/LightdashAnalytics'; // pragma: allowlist secret
import Logger from '../../../logging/logger';
import { type ProjectModel } from '../../../models/ProjectModel/ProjectModel';
import { type JiraAppService } from '../../../services/JiraAppService/JiraAppService';
import { type AiAgentReviewClassifierModel } from '../../models/AiAgentReviewClassifierModel';
import { type AiAgentReviewNotificationModel } from '../../models/AiAgentReviewNotificationModel';
import { type AiOrganizationSettingsModel } from '../../models/AiOrganizationSettingsModel';
import {
    buildReviewDrawerSearchParams,
    REVIEWS_BOARD_PATH,
} from '../../services/AiAgentReviewNotificationService';

type Dependencies = {
    siteUrl: string;
    model: AiAgentReviewNotificationModel;
    aiOrganizationSettingsModel: AiOrganizationSettingsModel;
    aiAgentReviewClassifierModel: AiAgentReviewClassifierModel;
    projectModel: ProjectModel;
    jiraAppService: JiraAppService;
    analytics: LightdashAnalytics; // pragma: allowlist secret
};

const formatTargetRef = (targetRef: AiAgentTargetRef): string =>
    Object.entries(targetRef)
        .filter(([key, value]) => key !== 'type' && value)
        .map(([, value]) => String(value))
        .join(' / ') || targetRef.type;

export const buildJiraIssueDescription = (args: {
    description: string;
    rootCause: string;
    priority: string;
    findingCount: number;
    targetRefs: AiAgentTargetRef[];
    projectName: string;
    reviewUrl: string;
}): string => {
    const lines = [
        args.description.trim(),
        '',
        `Priority: ${args.priority}`,
        `Root cause: ${args.rootCause}`,
        `Project: ${args.projectName}`,
        `Occurrences: ${args.findingCount}`,
    ];
    const affected = args.targetRefs.map(formatTargetRef);
    if (affected.length > 0) {
        lines.push(
            '',
            'Affected objects',
            ...affected.map((ref) => `- ${ref}`),
        );
    }
    lines.push('', `Open in Lightdash: ${args.reviewUrl}`); // pragma: allowlist secret
    return lines.join('\n');
};

const exportReviewItem = async (
    deps: Dependencies,
    args: {
        payload: CreateReviewJiraIssuePayload;
        fingerprint: string;
        reviewItem: AiAgentReviewItemSummary;
        destination: AiReviewJiraDestination & {
            jiraProjectId: string;
            jiraIssueTypeId: string;
        };
        projectName: string;
    },
): Promise<void> => {
    const { payload, fingerprint, reviewItem, destination } = args;
    const reviewUrl = `${deps.siteUrl}${REVIEWS_BOARD_PATH}?${buildReviewDrawerSearchParams(
        payload.projectUuid,
        fingerprint,
        reviewItem,
    )}`;
    await deps.aiAgentReviewClassifierModel.withReviewItemJiraLinkedIssueLock(
        { organizationUuid: payload.organizationUuid, fingerprint },
        async (linkedIssueUrl, setLinkedIssueUrl) => {
            if (linkedIssueUrl !== null) return;
            const created =
                await deps.jiraAppService.createIssueForOrganization(
                    payload.organizationUuid,
                    {
                        title: reviewItem.title,
                        description: buildJiraIssueDescription({
                            description: reviewItem.description,
                            rootCause: reviewItem.primaryRootCause,
                            priority: reviewItem.priority,
                            findingCount: reviewItem.findingCount,
                            targetRefs: reviewItem.targetRefs,
                            projectName: args.projectName,
                            reviewUrl,
                        }),
                        projectId: destination.jiraProjectId,
                        issueTypeId: destination.jiraIssueTypeId,
                    },
                );
            await setLinkedIssueUrl(created.url);
            try {
                await deps.jiraAppService.linkIssueUrlForOrganization(
                    payload.organizationUuid,
                    {
                        issueIdOrKey: created.key,
                        url: reviewUrl,
                        title: 'Open in Lightdash', // pragma: allowlist secret
                    },
                );
            } catch (error) {
                Logger.warn(
                    `Failed to attach review URL to Jira issue ${created.key}: ${getErrorMessage(
                        error,
                    )}`,
                );
            }
            deps.analytics.track({
                event: 'ai_review_jira_issue.created',
                anonymousId: payload.organizationUuid,
                properties: {
                    organizationId: payload.organizationUuid,
                    projectId: payload.projectUuid,
                },
            });
        },
    );
};

export const createReviewJiraIssue =
    (deps: Dependencies) =>
    async (payload: CreateReviewJiraIssuePayload): Promise<void> => {
        const settings =
            await deps.aiOrganizationSettingsModel.findByOrganizationUuid(
                payload.organizationUuid,
            );
        if (!settings?.aiAgentReviewsEnabled) return;
        const destination = await deps.model.getJiraDestination(
            payload.organizationUuid,
            payload.projectUuid,
        );
        const { jiraProjectId, jiraIssueTypeId } = destination;
        if (!destination.enabled || !jiraProjectId || !jiraIssueTypeId) return;
        const project = await deps.projectModel.get(payload.projectUuid);
        const failures: string[] = [];
        /* eslint-disable no-await-in-loop */
        for (const fingerprint of payload.fingerprints) {
            try {
                const reviewItem =
                    await deps.aiAgentReviewClassifierModel.getReviewItem(
                        payload.organizationUuid,
                        fingerprint,
                    );
                if (!reviewItem) {
                    Logger.warn(
                        'Skipping Jira issue creation for missing review item',
                        { fingerprint },
                    );
                } else {
                    await exportReviewItem(deps, {
                        payload,
                        fingerprint,
                        reviewItem,
                        destination: {
                            ...destination,
                            jiraProjectId,
                            jiraIssueTypeId,
                        },
                        projectName: project.name,
                    });
                }
            } catch (error) {
                failures.push(fingerprint);
                Logger.error(
                    `Failed to create Jira issue for review item ${fingerprint}: ${getErrorMessage(
                        error,
                    )}`,
                );
                deps.analytics.track({
                    event: 'ai_review_jira_issue.errored',
                    anonymousId: payload.organizationUuid,
                    properties: {
                        organizationId: payload.organizationUuid,
                        projectId: payload.projectUuid,
                        error: getErrorMessage(error),
                    },
                });
            }
        }
        /* eslint-enable no-await-in-loop */
        if (failures.length > 0) {
            throw new Error(
                `Failed to create Jira issues for review items: ${failures.join(', ')}`,
            );
        }
    };
