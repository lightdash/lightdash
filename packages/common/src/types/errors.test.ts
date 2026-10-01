import {
    BIGQUERY_TOKEN_ERROR_MESSAGE_MARKER,
    BigqueryTokenError,
    isBigqueryTokenErrorMessage,
    isPreviewWarehouseSignInExpiredMessage,
    PreviewWarehouseSignInExpiredError,
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

describe('PreviewWarehouseSignInExpiredError', () => {
    const error = new PreviewWarehouseSignInExpiredError({
        upstreamProjectUuid: 'upstream-uuid',
        upstreamProjectName: 'Jaffle shop',
    });

    it('points to the upstream project, not personal settings', () => {
        expect(error.message).toBe(
            "This preview's warehouse sign-in expired. Reconnect the warehouse on Jaffle shop.",
        );
        expect(error.message).not.toContain('personal settings');
        expect(error.statusCode).toBe(401);
        expect(error.data).toEqual({
            upstreamProjectUuid: 'upstream-uuid',
            upstreamProjectName: 'Jaffle shop',
        });
    });

    it('carries a message the frontend can recognise', () => {
        expect(isPreviewWarehouseSignInExpiredMessage(error.message)).toBe(
            true,
        );
        expect(isBigqueryTokenErrorMessage(error.message)).toBe(false);
    });
});
