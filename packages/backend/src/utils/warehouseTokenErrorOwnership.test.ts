import {
    BigqueryTokenError,
    SnowflakeTokenError,
    WarehouseCredentialsOwner,
    WarehouseQueryError,
    type WarehouseCredentialsOwnership,
} from '@lightdash/common';
import {
    attributeWarehouseTokenError,
    withWarehouseTokenErrorOwnership,
} from './warehouseTokenErrorOwnership';

const projectOwnership: WarehouseCredentialsOwnership = {
    credentialsOwner: WarehouseCredentialsOwner.PROJECT,
    userWarehouseCredentialsUuid: null,
};
const userOwnership: WarehouseCredentialsOwnership = {
    credentialsOwner: WarehouseCredentialsOwner.USER,
    userWarehouseCredentialsUuid: 'user-credentials-uuid',
};

describe('attributeWarehouseTokenError', () => {
    it('attributes an unattributed token error to the credential owner', () => {
        const error = attributeWarehouseTokenError(
            BigqueryTokenError.fromRejectedRefreshToken('invalid_grant'),
            projectOwnership,
        );

        expect(error).toBeInstanceOf(BigqueryTokenError);
        expect((error as BigqueryTokenError).data).toEqual(
            expect.objectContaining(projectOwnership),
        );
        expect((error as BigqueryTokenError).message).toContain(
            "this project's connection",
        );
    });

    it('keeps the original stack frames under the attributed message', () => {
        const original =
            BigqueryTokenError.fromRejectedRefreshToken('invalid_grant');
        const error = attributeWarehouseTokenError(
            original,
            projectOwnership,
        ) as BigqueryTokenError;

        const [header, ...frames] = (error.stack ?? '').split('\n');
        expect(header).toBe(`${error.name}: ${error.message}`);
        expect(frames.join('\n')).toBe(
            (original.stack ?? '').split('\n').slice(1).join('\n'),
        );
    });

    it('keeps an existing attribution', () => {
        const attributed = new SnowflakeTokenError('expired', userOwnership);

        expect(attributeWarehouseTokenError(attributed, projectOwnership)).toBe(
            attributed,
        );
    });

    it('leaves other errors untouched', () => {
        const error = new WarehouseQueryError('syntax error');

        expect(attributeWarehouseTokenError(error, projectOwnership)).toBe(
            error,
        );
    });
});

describe('withWarehouseTokenErrorOwnership', () => {
    class FakeWarehouseClient {
        credentials = { type: 'bigquery' };

        async runQuery(): Promise<string> {
            return this.fail();
        }

        getAdapterType() {
            return this.credentials.type;
        }

        // eslint-disable-next-line class-methods-use-this
        throwSync(): never {
            throw BigqueryTokenError.fromRejectedRefreshToken('invalid_grant');
        }

        // eslint-disable-next-line class-methods-use-this
        private async fail(): Promise<never> {
            throw BigqueryTokenError.fromRejectedRefreshToken('invalid_grant');
        }
    }

    it('attributes token errors rejected by async client methods', async () => {
        const client = withWarehouseTokenErrorOwnership(
            new FakeWarehouseClient(),
            userOwnership,
        );

        await expect(client.runQuery()).rejects.toMatchObject({
            name: 'BigqueryTokenError',
            data: expect.objectContaining(userOwnership),
        });
    });

    it('attributes token errors thrown synchronously', () => {
        const client = withWarehouseTokenErrorOwnership(
            new FakeWarehouseClient(),
            userOwnership,
        );

        expect(() => client.throwSync()).toThrow(
            expect.objectContaining({
                data: expect.objectContaining(userOwnership),
            }),
        );
    });

    it('passes through properties, return values and instanceof', () => {
        const client = withWarehouseTokenErrorOwnership(
            new FakeWarehouseClient(),
            projectOwnership,
        );

        expect(client).toBeInstanceOf(FakeWarehouseClient);
        expect(client.credentials).toEqual({ type: 'bigquery' });
        expect(client.getAdapterType()).toBe('bigquery');
    });
});
