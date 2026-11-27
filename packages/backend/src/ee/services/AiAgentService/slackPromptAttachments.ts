/** A file on the Slack message a prompt is created from, named by Slack's id. */
export type SlackPromptAttachmentRef = {
    slackFileId: string;
};

/**
 * Reads the references off a Slack message. Every path that creates a prompt
 * goes through this, also the ones that read the message again later (agent
 * picker, channel link, sign-in replay), so a file is not lost while the
 * prompt waits.
 */
export const slackPromptAttachmentRefs = (message: {
    files?: { id?: string }[];
}): SlackPromptAttachmentRef[] =>
    (message.files ?? []).flatMap(({ id }) =>
        id ? [{ slackFileId: id }] : [],
    );
