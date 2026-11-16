import {
    exploreRepoToolDefinition,
    type ToolExploreRepoStructuredContent,
} from '@lightdash/common';
import { tool } from 'ai';
import {
    decisionProbability,
    type AiDecisionClient,
} from '../decisions/AiDecisionClient';
import { ShellError } from '../repoFs/bashShell';
import type { RepoCodeSearchMatch } from '../repoFs/RepoFs';
import type { ExploreRepoFn } from '../types/aiAgentDependencies';
import type {
    ExecuteStructuredToolResult,
    ExecuteToolErrorResult,
} from '../utils/structuredToolResult';
import { toolErrorOutput } from '../utils/toolErrorHandler';

type Dependencies = {
    exploreRepo: ExploreRepoFn;
    decisions?: Pick<AiDecisionClient, 'evaluate'>;
    /** What the person asked, which is what a search result is useful for. */
    question: string;
};

const MAX_RANKED_MATCHES = 30;
// Below this every file reads as a passing mention, and the order the search found is kept.
const MIN_TOP_FIT = 0.2;

/** Orders search matches by how useful each file is for the question; an order, not a filter, so a middling fit still sorts. */
const rankRepoMatches = async (
    decisions: Pick<AiDecisionClient, 'evaluate'>,
    question: string,
    matches: RepoCodeSearchMatch[],
): Promise<RepoCodeSearchMatch[]> => {
    const shortlist = matches.slice(0, MAX_RANKED_MATCHES);
    if (shortlist.length < 2) return matches;
    const answers = await decisions.evaluate({
        operation: 'repo-search-ranking',
        state: {
            query: question,
            candidates: shortlist.map(({ path, fragments }) => ({
                path,
                matchingLines: fragments.map((line) => line.slice(0, 200)),
            })),
        },
        questions: Object.fromEntries(
            shortlist.map((_, index) => [
                `fit_${index}`,
                {
                    type: 'noul' as const,
                    instructions: `Is candidates[${index}] where what the query asks about is defined or built, so reading it would help answer the query? A file that only mentions the same words in passing is not. Judge the path and the matching lines; do not assume content that is not shown.`,
                },
            ]),
        ),
    });
    if (!answers) return matches;
    const fits = shortlist.map(
        (_, index) => decisionProbability(answers[`fit_${index}`]) ?? 0,
    );
    if (Math.max(...fits) < MIN_TOP_FIT) return matches;
    return [
        ...shortlist
            .map((match, index) => ({ match, index }))
            .sort((a, b) => fits[b.index] - fits[a.index] || a.index - b.index)
            .map(({ match }) => match),
        ...matches.slice(MAX_RANKED_MATCHES),
    ];
};

const toolDefinition = exploreRepoToolDefinition.for('agent');

export const getExploreRepo = ({
    exploreRepo,
    decisions,
    question,
}: Dependencies) =>
    tool({
        ...toolDefinition,
        execute: async ({
            command,
            target,
        }): Promise<
            | ExecuteStructuredToolResult<ToolExploreRepoStructuredContent>
            | ExecuteToolErrorResult
        > => {
            try {
                const output = await exploreRepo({
                    command,
                    target,
                    rankMatches:
                        decisions && question
                            ? (matches) =>
                                  rankRepoMatches(decisions, question, matches)
                            : null,
                });
                return {
                    result: output,
                    metadata: { status: 'success' },
                    structuredContent: { output },
                };
            } catch (error) {
                // A ShellError is an expected, agent-recoverable mistake (bad
                // flag, missing file, unsupported command, malformed target) —
                // surface it to the model and log it, but don't page Sentry.
                // Anything else (e.g. a GitHub access failure) is a real fault
                // worth capturing.
                return toolErrorOutput(error, 'Error reading the repository.', {
                    captureToSentry: !(error instanceof ShellError),
                });
            }
        },
    });
