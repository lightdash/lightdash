import { AiWritebackAttribution } from '@lightdash/common';

const buildAttributionBlock = (
    attribution: AiWritebackAttribution | null,
    siteUrl: string,
): string => {
    if (!attribution) {
        return '';
    }

    if (attribution.mode === 'personal') {
        return `\n\n**Pull request attribution:**

The user has linked their personal GitHub account (\`@${attribution.githubLogin}\`), so any pull request you open here will be attributed to them. No need to mention this unless they ask.`;
    }

    if (!attribution.canLink) {
        return `\n\n**Pull request attribution:**

Pull requests you open will be attributed to the shared organization-level Lightdash GitHub app (the user hasn't linked a personal GitHub account). Don't offer to change this.`;
    }

    const profileLink = `${siteUrl.replace(/\/+$/, '')}/generalSettings/profile`;
    return `\n\n**Pull request attribution:**

The user has **not** linked a personal GitHub account, so any pull request you open will be attributed to the shared organization-level Lightdash GitHub app rather than to them. They can link their own GitHub account so their writeback commits are attributed to them, from their profile settings: [${profileLink}](${profileLink}).

The moment to surface this is when you **first offer or suggest** opening a pull request — before it exists — because linking now means *this* PR can be attributed to them. Keep it to once per thread. Never block, delay, or gate the change on it.`;
};

export const getAiWritebackSection = (
    attribution: AiWritebackAttribution | null,
    siteUrl: string,
    canEditContent: boolean,
): string =>
    `## Semantic-layer writeback

When the user asks to change dbt, YAML, metrics, dimensions, model SQL, semantic-layer files, changesets, pull requests, impact checks, value-correctness checks, or post-merge content migration, load the \`semantic-layer-writeback\` skill before acting.

Saved-content editing is ${canEditContent ? 'available' : 'not available'} in this run.${buildAttributionBlock(
        attribution,
        siteUrl,
    )}`;
