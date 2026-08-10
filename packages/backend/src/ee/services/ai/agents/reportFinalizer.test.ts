import { type AiDeepResearchEvidencePack } from '@lightdash/common';
import { generateObject } from 'ai';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generateDeepResearchReport } from './reportFinalizer';

vi.mock('ai', async (importOriginal) => ({
    ...(await importOriginal<typeof import('ai')>()),
    generateObject: vi.fn(),
}));

const evidencePack: AiDeepResearchEvidencePack = {
    question: 'Why did revenue change?',
    queries: [],
    workerFindings: [],
};

const validMarkdown = `# Revenue Decline Explained

Revenue declined because renewals weakened while acquisition remained flat.

## Renewals weakened

Renewals are the clearest driver in the available evidence.

## Acquisition could not compensate

New business was insufficient to offset weaker renewals. The acquisition window is short, so the next useful check is whether the pattern persists in later cohorts.

## Conclusion

Renewal performance is the priority.`;

const invalidMarkdown = `# Incomplete Revenue Evidence

The evidence is incomplete.

## Only one finding

There is not enough evidence.

## Conclusion

Investigate further.`;

const modelOptions = { model: {} } as never;
const generateObjectMock = vi.mocked(generateObject);

const mockReports = (markdownReports: string[]) => {
    markdownReports.forEach((markdown) => {
        generateObjectMock.mockResolvedValueOnce({
            object: { markdown },
        } as never);
    });
};

describe('generateDeepResearchReport', () => {
    beforeEach(() => {
        generateObjectMock.mockReset();
    });

    it('returns a valid first attempt in the canonical format', async () => {
        mockReports([validMarkdown]);

        const report = await generateDeepResearchReport(modelOptions, {
            evidencePack,
            reason: 'complete',
        });

        expect(report.markdown).toBe(validMarkdown);
    });

    it('returns a valid correction attempt', async () => {
        mockReports([invalidMarkdown, validMarkdown]);

        const report = await generateDeepResearchReport(modelOptions, {
            evidencePack,
            reason: 'complete',
        });

        expect(generateObjectMock).toHaveBeenCalledTimes(2);
        expect(report.markdown).toBe(validMarkdown);
    });

    it('keeps invalid salvage output readable for the Markdown fallback', async () => {
        mockReports([invalidMarkdown, invalidMarkdown]);

        const report = await generateDeepResearchReport(modelOptions, {
            evidencePack,
            reason: 'complete',
        });

        expect(generateObjectMock).toHaveBeenCalledTimes(2);
        expect(report.markdown).toBe(invalidMarkdown);
    });
});
