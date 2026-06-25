import { subject } from '@casl/ability';
import {
    AiReviewNotificationEvent,
    AiReviewNotificationRecipient,
    defineUserAbility,
    EE_SCHEDULER_TASKS,
} from '@lightdash/common';
import { type NotificationsModel } from '../../models/NotificationsModel/NotificationsModel';
import { type OrganizationMemberProfileModel } from '../../models/OrganizationMemberProfileModel';
import { type AiAgentReviewClassifierModel } from '../models/AiAgentReviewClassifierModel';
import { type CommercialSchedulerClient } from '../scheduler/SchedulerClient';

// Legacy `/ai-agents/admin/reviews` is a query-stripping redirect; deep-link here.
export const REVIEWS_BOARD_PATH = '/generalSettings/ai/reviews';

// Drawer needs project+agent+thread+item; falls back to item-only without a finding.
export const buildReviewDrawerSearchParams = (
    projectUuid: string,
    fingerprint: string,
    reviewItem: Awaited<
        ReturnType<AiAgentReviewClassifierModel['getReviewItem']>
    >,
): string => {
    const finding = reviewItem?.latestFinding;
    const agentUuid = finding?.agentUuid ?? reviewItem?.agentUuid ?? null;
    if (finding?.threadUuid && agentUuid) {
        return new URLSearchParams({
            reviewProjectUuid: projectUuid,
            reviewAgentUuid: agentUuid,
            reviewThreadUuid: finding.threadUuid,
            reviewItemUuid: fingerprint,
        }).toString();
    }
    return new URLSearchParams({ reviewItemUuid: fingerprint }).toString();
};

type AiAgentReviewNotificationServiceArgs = {
    notificationsModel: NotificationsModel;
    schedulerClient: CommercialSchedulerClient;
    aiAgentReviewClassifierModel: AiAgentReviewClassifierModel;
    organizationMemberProfileModel: OrganizationMemberProfileModel;
};

export class AiAgentReviewNotificationService {
    private readonly notificationsModel: NotificationsModel;

    private readonly schedulerClient: CommercialSchedulerClient;

    private readonly aiAgentReviewClassifierModel: AiAgentReviewClassifierModel;

    private readonly organizationMemberProfileModel: OrganizationMemberProfileModel;

    constructor(args: AiAgentReviewNotificationServiceArgs) {
        this.notificationsModel = args.notificationsModel;
        this.schedulerClient = args.schedulerClient;
        this.aiAgentReviewClassifierModel = args.aiAgentReviewClassifierModel;
        this.organizationMemberProfileModel =
            args.organizationMemberProfileModel;
    }

    async getRecipients(
        organizationUuid: string,
    ): Promise<AiReviewNotificationRecipient[]> {
        const members =
            await this.organizationMemberProfileModel.getOrganizationMembers({
                organizationUuid,
                paginateArgs: { page: 1, pageSize: 10_000 },
            });

        return members.data
            .filter((member) =>
                defineUserAbility(member, []).can(
                    'manage',
                    subject('OrganizationAiAgent', { organizationUuid }),
                ),
            )
            .map((member) => ({
                userUuid: member.userUuid,
                email: member.email,
            }));
    }

    async notifyAssigned(args: {
        organizationUuid: string;
        projectUuid: string;
        fingerprint: string;
        assigneeUserUuid: string;
        actorUserUuid: string;
    }): Promise<void> {
        if (args.assigneeUserUuid === args.actorUserUuid) {
            return;
        }

        const reviewItem =
            await this.aiAgentReviewClassifierModel.getReviewItem(
                args.organizationUuid,
                args.fingerprint,
            );
        const metadata = {
            fingerprint: args.fingerprint,
            event: AiReviewNotificationEvent.Assigned,
            title: reviewItem?.title ?? 'AI review finding',
            rootCause: reviewItem?.primaryRootCause ?? 'unknown',
            projectUuid: args.projectUuid,
            count: 1,
            searchParams: buildReviewDrawerSearchParams(
                args.projectUuid,
                args.fingerprint,
                reviewItem,
            ),
        };

        await this.notificationsModel.createAiReviewNotifications({
            recipients: [{ userUuid: args.assigneeUserUuid }],
            metadata,
            message: `You were assigned: ${metadata.title}`,
            url: `${REVIEWS_BOARD_PATH}?${metadata.searchParams}`,
        });

        await this.schedulerClient.scheduleTask(
            EE_SCHEDULER_TASKS.SEND_REVIEW_NOTIFICATION,
            {
                organizationUuid: args.organizationUuid,
                projectUuid: args.projectUuid,
                event: AiReviewNotificationEvent.Assigned,
                fingerprints: [args.fingerprint],
                assigneeUserUuid: args.assigneeUserUuid,
                reviewRunUuid: null,
                userUuid: args.actorUserUuid,
            },
        );
    }

    async notifyNeedsReview(args: {
        organizationUuid: string;
        projectUuid: string;
        reviewRunUuid: string;
        fingerprints: string[];
    }): Promise<void> {
        if (args.fingerprints.length === 0) {
            return;
        }

        const [recipients, reviewItem] = await Promise.all([
            this.getRecipients(args.organizationUuid),
            this.aiAgentReviewClassifierModel.getReviewItem(
                args.organizationUuid,
                args.fingerprints[0],
            ),
        ]);
        const metadata = {
            fingerprint: args.fingerprints[0],
            event: AiReviewNotificationEvent.NeedsReview,
            title: reviewItem?.title ?? 'AI review finding',
            rootCause: reviewItem?.primaryRootCause ?? 'unknown',
            projectUuid: args.projectUuid,
            count: args.fingerprints.length,
            searchParams: buildReviewDrawerSearchParams(
                args.projectUuid,
                args.fingerprints[0],
                reviewItem,
            ),
        };

        await this.notificationsModel.createAiReviewNotifications({
            recipients,
            metadata,
            message: `${args.fingerprints.length} AI context findings need review`,
            url: `${REVIEWS_BOARD_PATH}?${metadata.searchParams}`,
        });

        await this.schedulerClient.scheduleTask(
            EE_SCHEDULER_TASKS.SEND_REVIEW_NOTIFICATION,
            {
                organizationUuid: args.organizationUuid,
                projectUuid: args.projectUuid,
                event: AiReviewNotificationEvent.NeedsReview,
                fingerprints: args.fingerprints,
                assigneeUserUuid: null,
                reviewRunUuid: args.reviewRunUuid,
            },
        );
    }
}
