import {
    AI_DEEP_RESEARCH_QUERY_HISTORY_RETENTION_DAYS,
    AI_DEEP_RESEARCH_REPORT_RETENTION_DAYS,
} from './types';

describe('Deep Research retention policy', () => {
    it('keeps query history longer than the report', () => {
        expect(AI_DEEP_RESEARCH_QUERY_HISTORY_RETENTION_DAYS).toBeGreaterThan(
            AI_DEEP_RESEARCH_REPORT_RETENTION_DAYS,
        );
    });
});
