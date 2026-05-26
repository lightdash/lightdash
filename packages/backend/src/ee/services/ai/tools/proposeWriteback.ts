import { tool } from 'ai';
import { z } from 'zod';
import type { ProposeWritebackFn } from '../types/aiAgentDependencies';
import { toModelOutput } from '../utils/toModelOutput';
import { toolErrorHandler } from '../utils/toolErrorHandler';

const toolProposeWritebackArgsSchema = z
    .object({
        prompt: z
            .string()
            .min(1)
            .describe(
                'A focused, self-contained natural-language instruction for the writeback agent describing exactly which files in the dbt project to change and how. The writeback agent does not see this conversation, so include every detail it needs (model name, file path hints, the literal change to make). Do not include preamble or pleasantries.',
            ),
    })
    .describe(
        [
            'Open a pull request that modifies the dbt project / Lightdash semantic layer for this project.',
            'Use this tool ONLY when the user asks to CHANGE something in the underlying repo — e.g. add or rename a metric, edit a dimension definition, modify a dbt model, update YAML metadata.',
            'Do NOT use this tool for read-only questions, querying data, exploring fields, or for changes that can be made inside Lightdash (use editContent / proposeChange for those).',
            'The writeback agent runs in an isolated sandbox, edits the repo, runs `lightdash compile`, and opens a pull request. The call is synchronous and can take several minutes.',
        ].join(' '),
    );

const toolProposeWritebackOutputSchema = z.object({
    result: z.string(),
    metadata: z.object({
        status: z.enum(['success', 'error']),
        prUrl: z.string().nullable().optional(),
    }),
});

type Dependencies = {
    proposeWriteback: ProposeWritebackFn;
};

export const getProposeWriteback = ({ proposeWriteback }: Dependencies) =>
    tool({
        description: toolProposeWritebackArgsSchema.description,
        inputSchema: toolProposeWritebackArgsSchema,
        outputSchema: toolProposeWritebackOutputSchema,
        execute: async ({ prompt }) => {
            try {
                const { prUrl, output } = await proposeWriteback({ prompt });

                const result = prUrl
                    ? `Opened pull request: ${prUrl}\n\nAgent summary:\n${output}`
                    : `The writeback agent ran but made no file changes, so no pull request was opened.\n\nAgent summary:\n${output}`;

                return {
                    result,
                    metadata: {
                        status: 'success' as const,
                        prUrl: prUrl ?? null,
                    },
                };
            } catch (error) {
                return {
                    result: toolErrorHandler(
                        error,
                        'Error running AI writeback. No pull request was opened.',
                    ),
                    metadata: {
                        status: 'error' as const,
                    },
                };
            }
        },
        toModelOutput: ({ output }) => toModelOutput(output),
    });
