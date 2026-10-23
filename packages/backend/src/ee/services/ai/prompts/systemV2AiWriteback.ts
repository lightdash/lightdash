import { AiWritebackAttribution } from '@lightdash/common';

/**
 * Tells the agent which GitHub identity a PR would be attributed to and, when
 * the user hasn't linked a personal account, lets it nudge them — in chat — to
 * link one.
 *
 * - `personal`: informational only (the PR is attributed to the linked account).
 * - `org` + `canLink`: include a nudge with an absolute settings deep-link.
 * - `org` + `!canLink`: state the org-level fallback, but no nudge (the personal
 *   linking settings panel would be hidden, so never deep-link to it).
 * - `null`: no block — attribution couldn't be resolved cheaply this turn.
 *
 * The wording deliberately hedges ("will be attributed to…") rather than
 * guaranteeing the commit is signed-as-user, since the authoritative resolution
 * happens later (a linked account with no repo access silently falls back).
 */
const buildAttributionBlock = (
    attribution: AiWritebackAttribution | null,
    siteUrl: string,
): string => {
    if (!attribution) {
        return '';
    }

    if (attribution.mode === 'personal') {
        return `## Pull request attribution

Pull requests you open will be attributed to the user's linked GitHub account (\`@${attribution.githubLogin}\`). Mention it only if they ask.`;
    }

    if (!attribution.canLink) {
        return `## Pull request attribution

Pull requests you open will be attributed to the shared organization-level Lightdash GitHub app: the user has no personal GitHub account linked and cannot link one here, so do not offer to change it.`;
    }

    const profileLink = `${siteUrl.replace(/\/+$/, '')}/generalSettings/profile`;
    return `## Pull request attribution

Pull requests you open will be attributed to the shared organization-level Lightdash GitHub app, because the user has not linked a personal GitHub account. They can link one from their profile settings: [${profileLink}](${profileLink}).

The first time you offer a pull request in this thread, or open one the user asked for, add a one-line reminder in your own words that they can link their GitHub first with that link; linking before the pull request exists attributes this one to them too. Mention it once per thread and frame it as optional: when they ignore or decline it, the pull request opens through the organization app.`;
};

const MISSING_FIELD_OFFER = `Offer a pull request that fixes the semantic layer when a question needs a metric or dimension no explore has, including when you could answer only from a raw table or a one-off custom metric, or when discovery shows duplicate, vaguely described or inconsistently named fields. Name the gap you found: a correct answer does not show the user whether it came from a curated metric. The \`repository-writeback\` skill holds the workflow.`;

const NO_CONTENT_EDIT = `You cannot edit saved charts or dashboards, so skip the content migration in the \`repository-writeback\` skill: when a pull request removes or renames a field, report the impact and say someone with edit access will repoint the affected content after the merge.`;

/** The inline writeback section; its guidance is in the `repository-writeback` skill. */
export const getAiWritebackSection = ({
    attribution,
    siteUrl,
    canEditContent,
}: {
    attribution: AiWritebackAttribution | null;
    siteUrl: string;
    canEditContent: boolean;
}): string =>
    [
        '## Repository writeback',
        MISSING_FIELD_OFFER,
        canEditContent ? '' : NO_CONTENT_EDIT,
        buildAttributionBlock(attribution, siteUrl),
    ]
        .filter(Boolean)
        .join('\n\n');
