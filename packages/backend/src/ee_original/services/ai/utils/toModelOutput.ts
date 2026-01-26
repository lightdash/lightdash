import { ToolResultPart } from 'ai';

type ToolOutput = {
    metadata: { status: string };
    result: string;
};

export const toModelOutput = <T extends ToolOutput>(
    output: T,
): ToolResultPart['output'] => {
    if (output.metadata.status === 'error') {
        // Some providers support explicit errors, but others don't
        // AI-sdk handles compat for us
        return { type: 'error-text', value: output.result };
    }
    return { type: 'text', value: output.result };
};
