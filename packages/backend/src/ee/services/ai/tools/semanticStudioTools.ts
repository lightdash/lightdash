import {
    proposeSemanticLayerChangeToolDefinition,
    readSemanticModelToolDefinition,
    type SemanticLayerDraftItemResult,
    type ToolProposeSemanticLayerChangeOutput,
} from '@lightdash/common';
import { tool } from 'ai';
import { findNewModelAdvice } from '../../SemanticStudioService/draftLint';
import type {
    ProposeSemanticLayerChangeFn,
    ReadSemanticModelFn,
} from '../types/aiAgentDependencies';
import { toolErrorOutput } from '../utils/toolErrorHandler';

const renderProposedModel = (
    {
        model,
        status,
        changes,
        refusals,
        error,
        notes,
    }: SemanticLayerDraftItemResult,
    advice: string[],
): string =>
    [
        `${model}: ${status}`,
        ...(changes.length > 0
            ? [
                  `  changes: ${changes.map(({ path, action }) => `${action} ${path}`).join(', ')}`,
              ]
            : []),
        ...(refusals.length > 0
            ? [
                  `  refusals: ${refusals.map(({ path, reason }) => `${path} (${reason})`).join(', ')}`,
              ]
            : []),
        ...(error ? [`  error: ${error}`] : []),
        ...notes.map((note) => `  note: ${note}`),
        ...advice.map((line) => `  advice: ${line}`),
    ].join('\n');

export const getProposeSemanticLayerChange = ({
    proposeSemanticLayerChange,
}: {
    proposeSemanticLayerChange: ProposeSemanticLayerChangeFn;
}) =>
    tool({
        ...proposeSemanticLayerChangeToolDefinition.for('agent'),
        execute: async ({ models }) => {
            try {
                const { results, diffs, draftChangeUuid } =
                    await proposeSemanticLayerChange(models);
                const output: ToolProposeSemanticLayerChangeOutput = {
                    result: [
                        ...results.map((result) => {
                            const created = diffs.find(
                                ({ model, contentBefore }) =>
                                    model === result.model &&
                                    contentBefore === null,
                            );
                            return renderProposedModel(
                                result,
                                result.status === 'ready' &&
                                    created?.contentAfter
                                    ? findNewModelAdvice(
                                          result.model,
                                          created.contentAfter,
                                      )
                                    : [],
                            );
                        }),
                        draftChangeUuid
                            ? "This joined the person's draft and they see its diff. Nothing is live until they publish the draft."
                            : 'Nothing joined the draft.',
                    ].join('\n'),
                    metadata: {
                        status: 'success',
                        models: results,
                        diffs,
                        draftChangeUuid,
                    },
                    structuredContent: { models: results },
                };
                return output;
            } catch (error) {
                return toolErrorOutput(
                    error,
                    'Error checking the semantic layer change.',
                );
            }
        },
    });

export const getReadSemanticModel = ({
    readSemanticModel,
}: {
    readSemanticModel: ReadSemanticModelFn;
}) =>
    tool({
        ...readSemanticModelToolDefinition.for('agent'),
        execute: async ({ name }) => {
            try {
                const read = await readSemanticModel(name);
                const describe = () => {
                    if (read.content !== null) {
                        return `${read.inDraft ? 'This is the draft of this model; it is not live yet.\n' : ''}${read.content}`;
                    }
                    return read.inDraft
                        ? `The draft removes ${name}; it is still live until the draft is published.`
                        : `No model is named ${name}. Models: ${read.modelNames.join(', ') || 'none yet'}.`;
                };
                return {
                    result: describe(),
                    metadata: { status: 'success' as const },
                    structuredContent: read,
                };
            } catch (error) {
                return toolErrorOutput(
                    error,
                    'Error reading the semantic model.',
                );
            }
        },
    });
