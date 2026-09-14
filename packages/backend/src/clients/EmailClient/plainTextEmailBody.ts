import { type CronCadence } from '@lightdash/common';

export type PlainTextEmailDownload = {
    filename: string;
    url: string;
};

/**
 * Passed to the notification senders when the delivery is set to plain text.
 * Its presence selects the text-only path; it carries the cadence the branded
 * templates never needed.
 */
export type PlainTextEmailMode = {
    cadence: CronCadence | undefined;
};

export type PlainTextEmailBody = {
    /** Name of the delivered resource, used by the generated sentence. */
    title: string;
    /** The delivery's own message. Replaces the generated sentence entirely. */
    message: string | undefined;
    /** Cadence word for the generated sentence; omitted when the cron has none. */
    cadence: CronCadence | undefined;
    /** Files that could not be attached, listed so the delivery still lands. */
    downloads: PlainTextEmailDownload[];
    noResults: boolean;
};

const buildGeneratedSentence = (
    title: string,
    cadence: CronCadence | undefined,
): string =>
    `Hello, here is your ${cadence ? `${cadence} ` : ''}report for ${title}.`;

/**
 * Body of a plain-text scheduled delivery: the sender's own words, or a
 * generated one-liner when they wrote none. Carries no Lightdash branding,
 * links or footer — the file is the payload.
 */
export const buildPlainTextEmailBody = ({
    title,
    message,
    cadence,
    downloads,
    noResults,
}: PlainTextEmailBody): string => {
    const intro = message?.trim()
        ? message.trim()
        : buildGeneratedSentence(title, cadence);

    const sections = [intro];

    if (noResults) {
        sections.push('This report returned no results.');
    }

    if (downloads.length > 0) {
        sections.push(
            downloads
                .map((download) => `${download.filename}: ${download.url}`)
                .join('\n'),
        );
    }

    return `${sections.join('\n\n')}\n`;
};
