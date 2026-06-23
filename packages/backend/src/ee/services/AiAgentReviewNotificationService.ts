import { subject } from '@casl/ability';
import {
    AiReviewNotificationEvent,
    AiReviewNotificationRecipient,
    defineUserAbility,
} from '@lightdash/common';
import { type NotificationsModel } from '../../models/NotificationsModel/NotificationsModel';
import { type OrganizationMemberProfileModel } from '../../models/OrganizationMemberProfileModel';
import { type AiAgentReviewClassifierModel } from '../models/AiAgentReviewClassifierModel';

type AiAgentReviewNotificationServiceArgs = {
    notificationsModel: NotificationsModel;
    aiAgentReviewClassifierModel: AiAgentReviewClassifierModel;
    organizationMemberProfileModel: OrganizationMemberProfileModel;
};

export class AiAgentReviewNotificationService {
    private readonly notificationsModel: NotificationsModel;

    private readonly aiAgentReviewClassifierModel: AiAgentReviewClassifierModel;

    private readonly organizationMemberProfileModel: OrganizationMemberProfileModel;

    constructor(args: AiAgentReviewNotificationServiceArgs) {
        this.notificationsModel = args.notificationsModel;
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
                    subject('AiAgent', { organizationUuid }),
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
            searchParams: `reviewItemUuid=${args.fingerprint}`,
        };

        await this.notificationsModel.createAiReviewNotifications({
            recipients: [{ userUuid: args.assigneeUserUuid }],
            metadata,
            message: `You were assigned: ${metadata.title}`,
            url: `/ai-agents/admin/reviews?${metadata.searchParams}`,
        });
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
            searchParams: `reviewRunUuid=${args.reviewRunUuid}`,
        };

        await this.notificationsModel.createAiReviewNotifications({
            recipients,
            metadata,
            message: `${args.fingerprints.length} AI context findings need review`,
            url: `/ai-agents/admin/reviews?${metadata.searchParams}`,
        });
    }
}
