import { describe, expect, it } from 'vitest';
import { getSubmitResearchReport } from './submitResearchReport';

type SubmitResult = {
    result: string;
    metadata: { status: 'success' | 'error' };
};

const execute = async (input: {
    markdown: string;
    charts: [];
}): Promise<SubmitResult> => {
    const submitResearchReport = getSubmitResearchReport();
    const result = await submitResearchReport.execute!(
        input,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        {} as any,
    );
    return result as SubmitResult;
};

describe('submitResearchReport', () => {
    it('returns field-level validation feedback that the model can repair', async () => {
        const result = await execute({
            markdown: 'No structured finding sections.',
            charts: [],
        });

        expect(result.metadata.status).toBe('error');
        expect(JSON.parse(result.result)).toEqual({
            submitted: false,
            errors: expect.arrayContaining([
                expect.objectContaining({
                    field: 'markdown',
                    message: expect.any(String),
                }),
            ]),
        });
    });
});
