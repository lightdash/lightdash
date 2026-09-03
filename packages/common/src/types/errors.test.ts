import {
    BIGQUERY_TOKEN_ERROR_MESSAGE_MARKER,
    BigqueryTokenError,
    isBigqueryTokenErrorMessage,
} from './errors';

describe('isBigqueryTokenErrorMessage', () => {
    it('matches the message a BigqueryTokenError carries', () => {
        const error = new BigqueryTokenError(
            `${BIGQUERY_TOKEN_ERROR_MESSAGE_MARKER} (invalid_grant: Token has been expired or revoked.; invalid_rapt). Reconnect your BigQuery account in personal settings.`,
        );

        expect(isBigqueryTokenErrorMessage(error.message)).toBe(true);
    });

    it('does not match the service account credential rejection', () => {
        expect(
            isBigqueryTokenErrorMessage(
                'Google rejected the BigQuery credentials (invalid_grant: Invalid grant: account not found).',
            ),
        ).toBe(false);
    });

    it('does not match an unrelated query failure', () => {
        expect(isBigqueryTokenErrorMessage('BigQuery quota exceeded.')).toBe(
            false,
        );
    });
});
