import { ParameterError } from '@lightdash/common';
import {
    assertLiveResponseBudget,
    LIVE_QUERY_MAX_RESPONSE_BYTES,
} from './calls';

const MB = 1024 * 1024;

describe('assertLiveResponseBudget', () => {
    it('lets a query read up to its budget', () => {
        expect(() =>
            assertLiveResponseBudget({
                label: 'Attio',
                limits: { responseBytesPerQuery: 50 * MB },
                responseBytes: 50 * MB,
            }),
        ).not.toThrow();
    });

    it('refuses a query past its budget, with a refusal code', () => {
        let error: unknown;
        try {
            assertLiveResponseBudget({
                label: 'Attio',
                limits: { responseBytesPerQuery: 50 * MB },
                responseBytes: 50 * MB + 1,
            });
        } catch (caught) {
            error = caught;
        }
        expect(error).toBeInstanceOf(ParameterError);
        expect((error as ParameterError).message).toBe(
            'This Attio query read more than 50 MB from Attio, the most one query may read. Add a filter or ask for fewer rows.',
        );
        expect((error as ParameterError).data).toEqual({
            liveSourceErrorCode: 'live_source.refused.response_too_large',
            liveSourceErrorCodes: ['live_source.refused.response_too_large'],
        });
    });

    it('uses the shared budget when the integration sets none', () => {
        expect(() =>
            assertLiveResponseBudget({
                label: 'GitHub',
                limits: {},
                responseBytes: LIVE_QUERY_MAX_RESPONSE_BYTES,
            }),
        ).not.toThrow();
        expect(() =>
            assertLiveResponseBudget({
                label: 'GitHub',
                limits: {},
                responseBytes: LIVE_QUERY_MAX_RESPONSE_BYTES + 1,
            }),
        ).toThrow('more than 100 MB');
    });
});
