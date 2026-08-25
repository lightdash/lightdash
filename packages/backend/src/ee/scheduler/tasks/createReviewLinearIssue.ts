import {
    getErrorMessage,
    type CreateReviewLinearIssuePayload,
} from '@lightdash/common'; // pragma: allowlist secret
import { type LightdashAnalytics } from '../../../analytics/LightdashAnalytics'; // pragma: allowlist secret
import Logger from '../../../logging/logger';
import { type ProjectModel } from '../../../models/ProjectModel/ProjectModel';
import { type LinearAppService } from '../../../services/LinearAppService/LinearAppService';
import { type AiAgentReviewClassifierModel } from '../../models/AiAgentReviewClassifierModel';
import { type AiAgentReviewNotificationModel } from '../../models/AiAgentReviewNotificationModel';
import {
    buildReviewDrawerSearchParams,
    REVIEWS_BOARD_PATH,
} from '../../services/AiAgentReviewNotificationService';

type CreateReviewLinearIssueDeps = {
    siteUrl: string;
    model: AiAgentReviewNotificationModel;
    aiAgentReviewClassifierModel: AiAgentReviewClassifierModel;
    projectModel: ProjectModel;
    linearAppService: LinearAppService;
    analytics: LightdashAnalytics; // pragma: allowlist secret
};

const buildIssueDescription = (args: {
    description: string;
    rootCause: string;
    projectName: string;
    reviewUrl: string;
}): string =>
    [
        args.description,
        '',
        `**Root cause:** ${args.rootCause}`,
        `**Project:** ${args.projectName}`,
        '',
        `[Open in Lightdash](${args.reviewUrl})`, // pragma: allowlist secret
    ]
        .filter((line, index, lines) => line !== '' || lines[index - 1] !== '')
        .join('\n')
        .trim();

export const createReviewLinearIssue =
    (deps: CreateReviewLinearIssueDeps) =>
    async (payload: CreateReviewLinearIssuePayload): Promise<void> => {
        const settings = await deps.model.getSettings(payload.organizationUuid);
        if (!settings.linearEnabled || !settings.linearTeamId) {
            return;
        }

        const project = await deps.projectModel.get(payload.projectUuid);

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
                    continue;
                }
                if (reviewItem.linkedIssueUrl) {
                    continue;
                }

                const reviewUrl = `${deps.siteUrl}${REVIEWS_BOARD_PATH}?${buildReviewDrawerSearchParams(
                    payload.projectUuid,
                    fingerprint,
                    reviewItem,
                )}`;
                const created = await deps.linearAppService.createIssueForOrganization(
                    payload.organizationUuid,
                    {
                        title: reviewItem.title,
                        description: buildIssueDescription({
                            description: reviewItem.description,
                            rootCause: reviewItem.primaryRootCause,
                            projectName: project.name,
                            reviewUrl,
                        }),
                        teamId: settings.linearTeamId,
                        projectId: settings.linearProjectId,
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
            } catch (error) {
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
    };
