import {
    parseSlackVisualizationSelection,
    stripSlackVisualizationSelection,
} from './slackVisualizationSelection';

describe('Slack visualization selection', () => {
    it('allows a summary without any supporting tables', () => {
        const response = 'Acquisition is up 10% this month.';
        expect(
            parseSlackVisualizationSelection(response).tableQueryUuids,
        ).toEqual([]);
        expect(stripSlackVisualizationSelection(response)).toBe(response);
    });

    it('selects only referenced executions in answer order without duplicates', () => {
        const response = `Summary.
<slack-table queryUuid="second" />
<slack-table queryUuid="first"/>
<slack-table queryUuid="second" />`;
        expect(
            parseSlackVisualizationSelection(response).tableQueryUuids,
        ).toEqual(['second', 'first']);
        expect(stripSlackVisualizationSelection(response)).toBe('Summary.');
    });

    it('ignores markers quoted in code fences', () => {
        const response =
            '```html\n<slack-table queryUuid="example" />\n```\n~~~\n<slack-table queryUuid="another" />\n~~~';
        expect(
            parseSlackVisualizationSelection(response).tableQueryUuids,
        ).toEqual([]);
        expect(stripSlackVisualizationSelection(response)).not.toContain(
            'slack-table',
        );
    });

    it('strips malformed tags without selecting any execution', () => {
        const response =
            'Summary. <slack-table queryUuid="" /> <slack-table id="wrong" /> <slack-table queryUuid="missing-close"></slack-table>';
        expect(
            parseSlackVisualizationSelection(response).tableQueryUuids,
        ).toEqual([]);
        expect(stripSlackVisualizationSelection(response)).toBe('Summary.');
    });

    it('removes an incomplete marker if generation stops mid-tag', () => {
        const response = 'Summary.\n<slack-table queryUuid="unfinished';
        expect(
            parseSlackVisualizationSelection(response).tableQueryUuids,
        ).toEqual([]);
        expect(stripSlackVisualizationSelection(response)).toBe('Summary.');
    });

    it('selects exact chart versions in answer order', () => {
        const response = `Summary.
<slack-chart versionUuid="final-version" />
<slack-chart versionUuid="comparison-version" />
<slack-chart versionUuid="final-version" />`;
        expect(parseSlackVisualizationSelection(response)).toEqual({
            tableQueryUuids: [],
            chartVersionUuids: ['final-version', 'comparison-version'],
        });
        expect(stripSlackVisualizationSelection(response)).toBe('Summary.');
    });

    it('selects tables and charts independently in a mixed answer', () => {
        const response =
            'Summary.\n<slack-table queryUuid="table-query" />\n<slack-chart versionUuid="chart-version" />';
        expect(parseSlackVisualizationSelection(response)).toEqual({
            tableQueryUuids: ['table-query'],
            chartVersionUuids: ['chart-version'],
        });
        expect(stripSlackVisualizationSelection(response)).toBe('Summary.');
    });

    it('ignores quoted, malformed and incomplete chart selections and hides their tags', () => {
        const response =
            'Summary.\n```html\n<slack-chart versionUuid="example" />\n```\n<slack-chart queryUuid="wrong-attribute" />\n<slack-chart versionUuid="unfinished';
        expect(parseSlackVisualizationSelection(response)).toEqual({
            tableQueryUuids: [],
            chartVersionUuids: [],
        });
        expect(stripSlackVisualizationSelection(response)).not.toContain(
            'slack-chart',
        );
    });

    it('preserves the surrounding answer paragraphs', () => {
        const response =
            'First paragraph.\n\n<slack-table queryUuid="selected" />\n\nFinal paragraph.';
        expect(stripSlackVisualizationSelection(response)).toBe(
            'First paragraph.\n\nFinal paragraph.',
        );
    });
});
