import {
    parseSlackTableSelection,
    stripSlackTableSelection,
} from './slackTableSelection';

describe('Slack table selection', () => {
    it('allows a summary without any supporting tables', () => {
        const response = 'Acquisition is up 10% this month.';
        expect(parseSlackTableSelection(response)).toEqual([]);
        expect(stripSlackTableSelection(response)).toBe(response);
    });

    it('selects only referenced executions in answer order without duplicates', () => {
        const response = `Summary.
<slack-table queryUuid="second" />
<slack-table queryUuid="first"/>
<slack-table queryUuid="second" />`;
        expect(parseSlackTableSelection(response)).toEqual(['second', 'first']);
        expect(stripSlackTableSelection(response)).toBe('Summary.');
    });

    it('ignores markers quoted in code fences', () => {
        const response =
            '```html\n<slack-table queryUuid="example" />\n```\n~~~\n<slack-table queryUuid="another" />\n~~~';
        expect(parseSlackTableSelection(response)).toEqual([]);
        expect(stripSlackTableSelection(response)).not.toContain('slack-table');
    });

    it('strips malformed tags without selecting any execution', () => {
        const response =
            'Summary. <slack-table queryUuid="" /> <slack-table id="wrong" /> <slack-table queryUuid="missing-close"></slack-table>';
        expect(parseSlackTableSelection(response)).toEqual([]);
        expect(stripSlackTableSelection(response)).toBe('Summary.');
    });

    it('removes an incomplete marker if generation stops mid-tag', () => {
        const response = 'Summary.\n<slack-table queryUuid="unfinished';
        expect(parseSlackTableSelection(response)).toEqual([]);
        expect(stripSlackTableSelection(response)).toBe('Summary.');
    });

    it('preserves the surrounding answer paragraphs', () => {
        const response =
            'First paragraph.\n\n<slack-table queryUuid="selected" />\n\nFinal paragraph.';
        expect(stripSlackTableSelection(response)).toBe(
            'First paragraph.\n\nFinal paragraph.',
        );
    });
});
