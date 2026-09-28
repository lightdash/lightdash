import {
    BIGQUERY_TOKEN_ERROR_MESSAGE_MARKER,
    BigqueryTokenError,
    isBigqueryTokenErrorMessage,
    isWarehouseTokenError,
    RedshiftIamTokenError,
    SnowflakeTokenError,
    WarehouseCredentialsOwner,
} from './errors';
import { WarehouseTypes } from './projects';

const providerDetail =
    'invalid_grant: Token has been expired or revoked.; invalid_rapt';

describe('isBigqueryTokenErrorMessage', () => {
    it('matches the message a BigqueryTokenError carries', () => {
        const error =
            BigqueryTokenError.fromRejectedRefreshToken(providerDetail);

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

describe('BigqueryTokenError', () => {
    it('is unattributed until the credential owner is known', () => {
        const error =
            BigqueryTokenError.fromRejectedRefreshToken(providerDetail);

        expect(isWarehouseTokenError(error)).toBe(true);
        expect(error.name).toBe('BigqueryTokenError');
        expect(error.statusCode).toBe(401);
        expect(error.data).toEqual({
            warehouseType: WarehouseTypes.BIGQUERY,
            credentialsOwner: null,
            userWarehouseCredentialsUuid: null,
        });
        expect(error.message).toBe(
            `${BIGQUERY_TOKEN_ERROR_MESSAGE_MARKER}. Reconnect BigQuery to keep running queries. (${providerDetail})`,
        );
    });

    it.each([
        {
            ownership: {
                credentialsOwner: WarehouseCredentialsOwner.USER,
                userWarehouseCredentialsUuid: 'user-credentials-uuid',
            },
            message: `${BIGQUERY_TOKEN_ERROR_MESSAGE_MARKER} for your account. Sign in to BigQuery again to keep running queries. (${providerDetail})`,
        },
        {
            ownership: {
                credentialsOwner: WarehouseCredentialsOwner.PROJECT,
                userWarehouseCredentialsUuid: null,
            },
            message: `${BIGQUERY_TOKEN_ERROR_MESSAGE_MARKER} for this project's connection. Ask someone who can manage this project to reconnect BigQuery in the project connection settings. (${providerDetail})`,
        },
        {
            ownership: {
                credentialsOwner: WarehouseCredentialsOwner.ORGANIZATION,
                userWarehouseCredentialsUuid: null,
            },
            message: `${BIGQUERY_TOKEN_ERROR_MESSAGE_MARKER} for your organization's shared connection. Ask an organization administrator to reconnect BigQuery. (${providerDetail})`,
        },
    ])(
        'tells the $ownership.credentialsOwner credential owner how to recover',
        ({ ownership, message }) => {
            const error =
                BigqueryTokenError.fromRejectedRefreshToken(
                    providerDetail,
                ).withCredentialsOwner(ownership);

            expect(error).toBeInstanceOf(BigqueryTokenError);
            expect(error.name).toBe('BigqueryTokenError');
            expect(error.message).toBe(message);
            expect(isBigqueryTokenErrorMessage(error.message)).toBe(true);
            expect(error.data).toEqual({
                warehouseType: WarehouseTypes.BIGQUERY,
                ...ownership,
            });
        },
    );

    it('keeps a message without provider detail when attributed', () => {
        const error = new BigqueryTokenError(
            'Please reauthenticate to access BigQuery',
        ).withCredentialsOwner({
            credentialsOwner: WarehouseCredentialsOwner.USER,
            userWarehouseCredentialsUuid: 'user-credentials-uuid',
        });

        expect(error.message).toBe('Please reauthenticate to access BigQuery');
        expect(error.data.credentialsOwner).toBe(
            WarehouseCredentialsOwner.USER,
        );
    });
});

describe('other warehouse token errors', () => {
    it.each([
        {
            error: new SnowflakeTokenError('Error refreshing snowflake token'),
            name: 'SnowflakeTokenError',
            warehouseType: WarehouseTypes.SNOWFLAKE,
        },
        {
            error: new RedshiftIamTokenError(
                'Your Redshift IAM AWS session has expired.',
            ),
            name: 'RedshiftIamTokenError',
            warehouseType: WarehouseTypes.REDSHIFT,
        },
    ])(
        'attributes $name without changing its name or message',
        ({ error, name, warehouseType }) => {
            const attributed = error.withCredentialsOwner({
                credentialsOwner: WarehouseCredentialsOwner.PROJECT,
                userWarehouseCredentialsUuid: null,
            });

            expect(attributed.name).toBe(name);
            expect(attributed.message).toBe(error.message);
            expect(attributed.data).toEqual({
                warehouseType,
                credentialsOwner: WarehouseCredentialsOwner.PROJECT,
                userWarehouseCredentialsUuid: null,
            });
        },
    );
});
