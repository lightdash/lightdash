import { ParameterError } from '@lightdash/common';
import {
    assertLiveResponseBudget,
    LIVE_QUERY_MAX_RESPONSE_BYTES,
} from './calls';

describe('assertLiveResponseBudget', () => {
    it('lets a query read up to the budget', () => {
        expect(() =>
            assertLiveResponseBudget({
                label: 'Attio',
                responseBytes: LIVE_QUERY_MAX_RESPONSE_BYTES,
            }),
        ).not.toThrow();
    });

    it('refuses a query past the budget, with a refusal code', () => {
        let error: unknown;
        try {
            assertLiveResponseBudget({
                label: 'Attio',
                responseBytes: LIVE_QUERY_MAX_RESPONSE_BYTES + 1,
            });
        } catch (caught) {
            error = caught;
        }
        expect(error).toBeInstanceOf(ParameterError);
        expect((error as ParameterError).message).toBe(
            'This Attio query read more than 128 MB from Attio, the most one query may read. Add a filter or ask for fewer rows.',
        );
        expect((error as ParameterError).data).toEqual({
            liveSourceErrorCode: 'live_source.refused.response_too_large',
            liveSourceErrorCodes: ['live_source.refused.response_too_large'],
        });
    });
});
