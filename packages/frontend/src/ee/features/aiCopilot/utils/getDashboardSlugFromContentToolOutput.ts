import { type AiAgentToolOutput } from '../types';

type EditContentToolArgs = {
    type?: 'dashboard' | 'chart';
    slug?: string;
};

type CreateContentToolArgs = {
    type?: 'dashboard' | 'chart';
    content?: {
        slug?: string;
    };
};

type ContentToolOutput = {
    result?: unknown;
    metadata?: { status?: unknown };
};

const getSlugFromToolOutput = (toolOutput: unknown): string | null => {
    const output = toolOutput as ContentToolOutput | undefined;
    if (output?.metadata?.status !== 'success') return null;

    if (typeof output.result !== 'string') return null;

    try {
        const content = JSON.parse(output.result) as { slug?: unknown };
        return typeof content.slug === 'string' && content.slug.length > 0
            ? content.slug
            : null;
    } catch {
        return null;
    }
};

const getDashboardSlugFromContentToolOutput = (
    toolOutput: AiAgentToolOutput,
): string | null => {
    if (toolOutput.isPreliminary) return null;

    switch (toolOutput.toolName) {
        case 'createContent': {
            const args = toolOutput.toolArgs as CreateContentToolArgs;
            if (args.type !== 'dashboard') return null;

            return getSlugFromToolOutput(toolOutput.toolOutput);
        }
        case 'editContent': {
            const args = toolOutput.toolArgs as EditContentToolArgs;
            if (args.type !== 'dashboard') return null;

            return (
                getSlugFromToolOutput(toolOutput.toolOutput) ??
                args.slug ??
                null
            );
        }
        default:
            return null;
    }
};

export const getDashboardUrlFromContentToolOutput = (
    projectUuid: string,
    toolOutput: AiAgentToolOutput,
): string | null => {
    const dashboardSlug = getDashboardSlugFromContentToolOutput(toolOutput);
    return dashboardSlug
        ? `/projects/${projectUuid}/dashboards/${dashboardSlug}`
        : null;
};
