import {
    toolSubmitWorkerFindingsOutputSchema,
    type AiDeepResearchWorkerFindings,
} from '@lightdash/common';
import { getSubmitWorkerFindings } from './submitWorkerFindings';

const findings: AiDeepResearchWorkerFindings = {
    summary: 'Orders fell 12% in repriced categories.',
    evidence: [
        {
            finding: 'Weekly orders dropped from 1,200 to 1,056.',
            queryUuids: ['query-1'],
            sources: [],
        },
    ],
    limitations: ['Only four weeks of data were available.'],
    confidence: 'medium',
};

const execute = async (
    tool: ReturnType<typeof getSubmitWorkerFindings>,
    args: Parameters<NonNullable<typeof tool.execute>>[0],
) => {
    if (!tool.execute) {
        throw new Error('Expected the tool to be executable');
    }
    const output = await tool.execute(args, {
        messages: [],
        toolCallId: 'tool-call-1',
    });
    if (Symbol.asyncIterator in output) {
        throw new Error('Expected a non-streaming tool result');
    }
    return output;
};

describe('submitWorkerFindings', () => {
    it('hands the packet to the run and acknowledges as text and structured content', async () => {
        const onFindings = vi.fn();
        const tool = getSubmitWorkerFindings({ onFindings });

        const output = await execute(tool, findings);

        expect(onFindings).toHaveBeenCalledWith(findings);
        expect(output).toEqual({
            result: JSON.stringify({ submitted: true }),
            metadata: { status: 'success' },
            structuredContent: { submitted: true },
        });
        expect(
            toolSubmitWorkerFindingsOutputSchema.safeParse(output).success,
        ).toBe(true);
        expect(JSON.parse(output.result)).toEqual(output.structuredContent);
    });

    it('rejects an invalid packet without handing it to the run', async () => {
        const onFindings = vi.fn();
        const tool = getSubmitWorkerFindings({ onFindings });

        const output = await execute(tool, { ...findings, summary: '' });

        expect(onFindings).not.toHaveBeenCalled();
        expect(output.metadata).toEqual({ status: 'error' });
        expect(output.structuredContent).toEqual({ error: output.result });
        expect(
            toolSubmitWorkerFindingsOutputSchema.safeParse(output).success,
        ).toBe(true);
    });
});
