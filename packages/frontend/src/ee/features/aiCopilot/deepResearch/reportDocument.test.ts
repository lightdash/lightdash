import { describe, expect, it } from 'vitest';
import { getDeepResearchReportHeadings } from './reportDocument';

describe('getDeepResearchReportHeadings', () => {
    it('extracts rendered level-two headings from the Markdown AST', () => {
        const markdown = `# Report title

## **Baseline** ranking

\`\`\`md
## Not a section
\`\`\`

Temporary spikes
----------------

### Supporting detail`;

        expect(getDeepResearchReportHeadings(markdown)).toEqual([
            {
                id: 'report-baseline-ranking-1',
                value: 'Baseline ranking',
                depth: 1,
            },
            {
                id: 'report-temporary-spikes-2',
                value: 'Temporary spikes',
                depth: 1,
            },
        ]);
    });
});
