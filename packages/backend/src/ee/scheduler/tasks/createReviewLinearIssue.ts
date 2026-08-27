import {
    getErrorMessage,
    type AiAgentTargetRef,
    type CreateReviewLinearIssuePayload,
} from '@lightdash/common'; // pragma: allowlist secret
import { type LightdashAnalytics } from '../../../analytics/LightdashAnalytics'; // pragma: allowlist secret
import Logger from '../../../logging/logger';
import { type ProjectModel } from '../../../models/ProjectModel/ProjectModel';
import { type LinearAppService } from '../../../services/LinearAppService/LinearAppService';
import { type AiAgentReviewClassifierModel } from '../../models/AiAgentReviewClassifierModel';
import { type AiAgentReviewNotificationModel } from '../../models/AiAgentReviewNotificationModel';
import { type AiOrganizationSettingsModel } from '../../models/AiOrganizationSettingsModel';
import {
    buildReviewDrawerSearchParams,
    REVIEWS_BOARD_PATH,
} from '../../services/AiAgentReviewNotificationService';

type CreateReviewLinearIssueDeps = {
    siteUrl: string;
    model: AiAgentReviewNotificationModel;
    aiOrganizationSettingsModel: AiOrganizationSettingsModel;
    aiAgentReviewClassifierModel: AiAgentReviewClassifierModel;
    projectModel: ProjectModel;
    linearAppService: LinearAppService;
    analytics: LightdashAnalytics; // pragma: allowlist secret
};

const formatTargetRef = (targetRef: AiAgentTargetRef): string =>
    Object.entries(targetRef)
        .filter(([key, value]) => key !== 'type' && value)
        .map(([, value]) => String(value))
        .join(' / ') || targetRef.type;

export const buildIssueDescription = (args: {
    description: string;
    rootCause: string;
    priority: string;
    findingCount: number;
    targetRefs: AiAgentTargetRef[];
    projectName: string;
    reviewUrl: string;
}): string => {
    const details = [
        `**Priority:** ${args.priority}`,
        `**Root cause:** ${args.rootCause}`,
        `**Project:** ${args.projectName}`,
        `**Occurrences:** ${args.findingCount}`,
    ];
    const affected = args.targetRefs.map(formatTargetRef);

    return [
        args.description.trim(),
        details.join('\n'),
        affected.length > 0
            ? `**Affected objects**\n${affected.map((ref) => `- ${ref}`).join('\n')}`
            : '',
        `[Open in Lightdash](${args.reviewUrl})`, // pragma: allowlist secret
    ]
        .filter((section) => section !== '')
        .join('\n\n');
};

export const createReviewLinearIssue =
    (deps: CreateReviewLinearIssueDeps) =>
    async (payload: CreateReviewLinearIssuePayload): Promise<void> => {
        const aiSettings =
            await deps.aiOrganizationSettingsModel.findByOrganizationUuid(
                payload.organizationUuid,
            );
        if (!aiSettings?.aiAgentReviewsEnabled) {
            return;
        }

        const destination = await deps.model.getLinearDestination(
            payload.organizationUuid,
            payload.projectUuid,
        );
        if (!destination.enabled || !destination.linearTeamId) {
            return;
        }

        const project = await deps.projectModel.get(payload.projectUuid);
        const failedFingerprints: string[] = [];

        // Issues are created one at a time on purpose: Linear rate limits the
        // API, and a partial failure must not lose the items already created.
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
                        'Skipping Linear issue creation for missing review item',
                        { fingerprint },
                    );
                } else if (reviewItem.linkedIssueUrl === null) {
                    const reviewUrl = `${deps.siteUrl}${REVIEWS_BOARD_PATH}?${buildReviewDrawerSearchParams(
                        payload.projectUuid,
                        fingerprint,
                        reviewItem,
                    )}`;
                    const created =
                        await deps.linearAppService.createIssueForOrganization(
                            payload.organizationUuid,
                            {
                                title: reviewItem.title,
                                description: buildIssueDescription({
                                    description: reviewItem.description,
                                    rootCause: reviewItem.primaryRootCause,
                                    priority: reviewItem.priority,
                                    findingCount: reviewItem.findingCount,
                                    targetRefs: reviewItem.targetRefs,
                                    projectName: project.name,
                                    reviewUrl,
                                }),
                                teamId: destination.linearTeamId,
                                projectId: destination.linearProjectId,
                            },
                        );

                    await deps.aiAgentReviewClassifierModel.updateReviewItemLinkedIssueUrl(
                        {
                            organizationUuid: payload.organizationUuid,
                            fingerprint,
                            linkedIssueUrl: created.url,
                        },
                    );

                    deps.analytics.track({
                        event: 'ai_review_linear_issue.created',
                        anonymousId: payload.organizationUuid,
                        properties: {
                            organizationId: payload.organizationUuid,
                            projectId: payload.projectUuid,
                        },
                    });
                }
            } catch (error) {
                failedFingerprints.push(fingerprint);
                Logger.error(
                    `Failed to create Linear issue for review item ${fingerprint}: ${getErrorMessage(
                        error,
                    )}`,
                );
                deps.analytics.track({
                    event: 'ai_review_linear_issue.errored',
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

        // Fail the job so Graphile retries. Items that succeeded already carry a
        // linked issue URL, so a retry only reattempts the ones that failed.
        if (failedFingerprints.length > 0) {
            throw new Error(
                `Failed to create Linear issues for review items: ${failedFingerprints.join(
                    ', ',
                )}`,
            );
        }
    };
