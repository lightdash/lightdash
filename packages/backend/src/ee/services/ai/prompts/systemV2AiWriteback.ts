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

The user has linked their personal GitHub account (\`@${attribution.githubLogin}\`), so any pull request you open here will be attributed to them. No need to mention this unless they ask.`;
    }

    if (!attribution.canLink) {
        return `## Pull request attribution

Pull requests you open will be attributed to the shared organization-level Lightdash GitHub app (the user hasn't linked a personal GitHub account). Don't offer to change this.`;
    }

    const profileLink = `${siteUrl.replace(/\/+$/, '')}/generalSettings/profile`;
    return `## Pull request attribution

The user has **not** linked a personal GitHub account, so any pull request you open will be attributed to the shared organization-level Lightdash GitHub app rather than to them. They can link their own GitHub account so their writeback commits are attributed to them, from their profile settings: [${profileLink}](${profileLink}).

The moment to surface this is when you **first offer or suggest** opening a pull request — before it exists — because linking now means *this* PR (not just future ones) can be attributed to them. At that point add a brief one-line reminder, in your own words, that they can link their personal GitHub first with that settings link, framed as optional. Keep it to once per thread: if you mention it when offering, don't repeat it when the PR opens (and vice versa). Never block, delay, or gate the change on it — if they ignore or decline, proceed exactly as today and the pull request still opens via the org app. Don't interrupt mid-task to raise it.`;
};

const MISSING_FIELD_OFFER = `When a data question needs a metric or dimension the explore lacks, offer to add it to the semantic layer with a pull request, using the \`repository-writeback\` skill.`;

// Merging sends the migration follow-up only to agents that can edit content.
const NO_CONTENT_EDIT = `You cannot edit saved charts or dashboards, so a merge sends you no follow-up: when a pull request removes or renames a field, report the impact and say someone with edit access will repoint the affected content after the merge.`;

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
