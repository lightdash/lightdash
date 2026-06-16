import { detectContentEditBlock } from './AiAgentService';

describe('detectContentEditBlock', () => {
    it('detects the agent declining to edit existing content', () => {
        expect(
            detectContentEditBlock(
                "I can't directly overwrite an existing dashboard tile from here.",
            ),
        ).toBe(true);
        expect(
            detectContentEditBlock(
                'I am not able to update the saved chart for you.',
            ),
        ).toBe(true);
        expect(
            detectContentEditBlock(
                "I can't modify that dashboard — editing content isn't enabled.",
            ),
        ).toBe(true);
    });

    it('does not fire on normal replies or unrelated refusals', () => {
        expect(
            detectContentEditBlock('Here is a chart of revenue by month.'),
        ).toBe(false);
        expect(
            detectContentEditBlock(
                "I can't access that data because data access is disabled.",
            ),
        ).toBe(false);
        expect(detectContentEditBlock('')).toBe(false);
    });
});
