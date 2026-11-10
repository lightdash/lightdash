import {
    proposeSemanticLayerChangeToolDefinition,
    readSemanticModelToolDefinition,
    type SemanticLayerDraftItemResult,
    type ToolProposeSemanticLayerChangeOutput,
} from '@lightdash/common';
import { tool } from 'ai';
import type {
    ProposeSemanticLayerChangeFn,
    ReadSemanticModelFn,
} from '../types/aiAgentDependencies';
import { toolErrorOutput } from '../utils/toolErrorHandler';

const renderProposedModel = ({
    model,
    status,
    changes,
    refusals,
    error,
}: SemanticLayerDraftItemResult): string =>
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
                        ...results.map(renderProposedModel),
                        draftChangeUuid
                            ? "This joined the person's draft and they see its diff. Nothing is live until they apply the draft."
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
                        ? `The draft removes ${name}; it is still live until the draft is applied.`
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
