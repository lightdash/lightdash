import { type Knex } from 'knex';
import type {
    RefreshRowKey,
    RefreshRun,
    RefreshTokenRotation,
} from '../../models/RefreshTokenRotation/RefreshTokenRotation';

export type OAuthTokenExchange = {
    accessToken: string;
    refreshToken?: string;
};

export class OAuthRefreshExchangeError extends Error {
    constructor(
        readonly originalError: unknown,
        readonly refreshToken: string,
    ) {
        super('OAuth token exchange failed');
    }
}

export class OAuthCredentialRefresher {
    constructor(private readonly rotation: Pick<RefreshTokenRotation, 'run'>) {}

    async refresh<R extends OAuthTokenExchange>({
        refreshToken,
        row,
        exchange,
        persist,
    }: {
        refreshToken: string;
        row: {
            key: RefreshRowKey;
            shareKey: string;
            readCurrentRefreshToken: RefreshRun<R>['readCurrentRefreshToken'];
        } | null;
        exchange: RefreshRun<R>['exchange'];
        persist: (args: {
            lockedRefreshToken: string;
            result: R;
            trx?: Knex;
        }) => Promise<void>;
    }): Promise<R> {
        const exchangeWithAttribution = async (
            sentRefreshToken: string,
        ): Promise<R> => {
            try {
                return await exchange(sentRefreshToken);
            } catch (error) {
                throw new OAuthRefreshExchangeError(error, sentRefreshToken);
            }
        };
        if (row !== null) {
            const { result } = await this.rotation.run({
                ...row,
                exchange: exchangeWithAttribution,
                persist,
            });
            return result;
        }
        const result = await exchangeWithAttribution(refreshToken);
        await persist({ lockedRefreshToken: refreshToken, result });
        return result;
    }
}
