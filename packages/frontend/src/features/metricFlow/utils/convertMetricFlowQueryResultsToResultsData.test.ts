import { describe, expect, it } from 'vitest';
import convertMetricFlowQueryResultsToResultsData from './convertMetricFlowQueryResultsToResultsData';
import {
    EXPECTED_CONVERTED_SNOWFLAKE_DATA,
    MOCK_EXPLORE,
    MOCK_SNOWFLAKE_DATA,
} from './convertMetricFlowQueryResultsToResultsData.mock';

describe('convertMetricFlowQueryResultsToResultsData', () => {
    it('should convert snowflake data where columns are uppercase', async () => {
        expect(
            convertMetricFlowQueryResultsToResultsData(
                MOCK_EXPLORE,
                MOCK_SNOWFLAKE_DATA,
            ),
        ).toEqual(EXPECTED_CONVERTED_SNOWFLAKE_DATA);
    });
});
