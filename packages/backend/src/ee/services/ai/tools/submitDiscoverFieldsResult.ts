import { tool } from 'ai';
import {
    discoverFieldsSelectionSchemaV2,
    type DiscoverFieldsSelectionV2,
} from '../agents/discoverFields/schema';
import { toModelOutput } from '../utils/toModelOutput';
import { toolErrorHandler } from '../utils/toolErrorHandler';
import {
    stringifyToolJson,
    type StructuredToolResult,
} from './toolOutputFormat';

type SubmitDiscoverFieldsResult = { handoff: DiscoverFieldsSelectionV2 };

type SubmitDiscoverFieldsResultSuccessOutput = {
    result: string;
    metadata: { status: 'success' };
} & StructuredToolResult<SubmitDiscoverFieldsResult>;

type SubmitDiscoverFieldsResultErrorOutput = {
    result: string;
    metadata: { status: 'error' };
};

export type SubmitDiscoverFieldsResultOutput =
    | SubmitDiscoverFieldsResultSuccessOutput
    | SubmitDiscoverFieldsResultErrorOutput;

export const getSubmitDiscoverFieldsResult = () =>
    tool({
        description:
            'Submit final discovery selectors. Call this as your LAST step. For resolved, pass only exploreName, ordered dimensionIds, ordered metricIds, rationale, and uncertainties; use uncertainties: null when selection was straightforward. The parent rehydrates exact field/explore details.',
        inputSchema: discoverFieldsSelectionSchemaV2,
        execute: async (input): Promise<SubmitDiscoverFieldsResultOutput> => {
            try {
                return {
                    result: stringifyToolJson(input),
                    structuredResult: input,
                    metadata: { status: 'success' },
                } satisfies SubmitDiscoverFieldsResultSuccessOutput;
            } catch (error) {
                return {
                    result: toolErrorHandler(
                        error,
                        'Error submitting discovery result.',
                    ),
                    metadata: { status: 'error' },
                } satisfies SubmitDiscoverFieldsResultErrorOutput;
            }
        },
        toModelOutput: ({ output }) => toModelOutput(output),
    });
