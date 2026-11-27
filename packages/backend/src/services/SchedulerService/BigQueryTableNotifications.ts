import {
    NotFoundError,
    type BigQueryTableNotice,
    type BigQueryTableNoticePayload,
    type OrganizationMemberProfile,
} from '@lightdash/common';
import type EmailClient from '../../clients/EmailClient/EmailClient';
import type { SlackClient } from '../../clients/Slack/SlackClient';
import { truncateText } from '../../clients/Slack/SlackMessageBlocks';
import Logger from '../../logging/logger';
import type { EmailModel } from '../../models/EmailModel';
import type { OrganizationMemberProfileModel } from '../../models/OrganizationMemberProfileModel';

export type BigQueryTableFailureNotice = BigQueryTableNotice & {
    organizationUuid: string;
    ownerUuid: string;
    schedulerName: string;
    deliveryUrl: string;
};

type Dependencies = {
    emailClient: Pick<
        EmailClient,
        'canSendEmail' | 'sendGenericNotificationEmail'
    >;
    slackClient: Pick<
        SlackClient,
        'isEnabled' | 'getNotificationChannel' | 'postMessage'
    >;
    organizationMemberProfileModel: Pick<
        OrganizationMemberProfileModel,
        'getOrganizationMemberByUuid' | 'getOrganizationAdmins'
    >;
    emailModel: Pick<EmailModel, 'getPrimaryEmailStatus'>;
};

const findOrNull = <T>(query: Promise<T>): Promise<T | null> =>
    query.catch((error: unknown) => {
        if (error instanceof NotFoundError) return null;
        throw error;
    });

async function notificationRecipient(
    { organizationMemberProfileModel, emailModel }: Dependencies,
    { organizationUuid, ownerUuid }: BigQueryTableFailureNotice,
): Promise<string | null> {
    const verifiedAddress = async (member: OrganizationMemberProfile) => {
        if (!member.isActive || member.isPending) return null;
        const email = await findOrNull(
            emailModel.getPrimaryEmailStatus(member.userUuid),
        );
        return email?.isVerified ? email.email : null;
    };
    // Membership lookups exclude service accounts and use the delivery's organization.
    const owner = await findOrNull(
        organizationMemberProfileModel.getOrganizationMemberByUuid(
            organizationUuid,
            ownerUuid,
        ),
    );
    const ownerAddress = owner && (await verifiedAddress(owner));
    if (ownerAddress) return ownerAddress;

    const admins =
        await organizationMemberProfileModel.getOrganizationAdmins(
            organizationUuid,
        );
    const addresses = await Promise.all(
        admins
            .filter((member) => member.userUuid !== ownerUuid)
            .map(verifiedAddress),
    );
    // Send one copy, choosing the same admin across worker retries.
    return (
        addresses.filter((email): email is string => !!email).sort()[0] ?? null
    );
}

export async function notifyBigQueryTableFailure(
    deps: Dependencies,
    notice: BigQueryTableFailureNotice,
    channel: BigQueryTableNoticePayload['channel'],
): Promise<void> {
    const { event, schedulerName, deliveryUrl } = notice;
    const subject =
        event.type === 'paused'
            ? `Scheduled delivery paused: ${schedulerName}`
            : `Scheduled delivery attempt failed: ${schedulerName}`;
    const message =
        event.type === 'paused'
            ? 'BigQuery could not find the same source table for at least five consecutive scheduled runs spanning at least seven days. Future scheduled runs have stopped. Restore the table or update the source query, then resume the delivery.'
            : `BigQuery could not find a source table on attempt ${event.attempt} of job ${event.jobId}. Check that the source table exists and that the query references the correct dataset and location.`;
    if (channel === 'slack') {
        if (!deps.slackClient.isEnabled) return;
        const slackChannel = await deps.slackClient.getNotificationChannel(
            notice.organizationUuid,
        );
        if (!slackChannel) return;
        await deps.slackClient.postMessage({
            organizationUuid: notice.organizationUuid,
            channel: slackChannel,
            text: subject,
            mrkdwn: false,
            link_names: false,
            unfurl_links: false,
            unfurl_media: false,
            blocks: [
                {
                    type: 'section',
                    text: {
                        type: 'plain_text',
                        text: truncateText(`${subject}\n${message}`, 3000),
                    },
                    accessory: {
                        type: 'button',
                        text: { type: 'plain_text', text: 'Open delivery' },
                        action_id: 'open_delivery',
                        url: deliveryUrl,
                    },
                },
            ],
        });
        return;
    }

    if (!deps.emailClient.canSendEmail()) {
        Logger.info(
            `Skipping missing-table email for scheduler ${notice.schedulerUuid}: email is not configured`,
        );
        return;
    }
    const recipient = await notificationRecipient(deps, notice);
    if (!recipient) {
        throw new Error(
            `No active owner or organization admin with a verified email for scheduler ${notice.schedulerUuid}`,
        );
    }
    await deps.emailClient.sendGenericNotificationEmail(
        [recipient],
        subject,
        subject,
        `${message}\n\n[Open delivery](${deliveryUrl})`,
    );
}
