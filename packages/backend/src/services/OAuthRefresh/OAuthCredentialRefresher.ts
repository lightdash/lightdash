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
        if (row !== null) {
            const { result } = await this.rotation.run({
                ...row,
                exchange,
                persist,
            });
            return result;
        }
        const result = await exchange(refreshToken);
        await persist({ lockedRefreshToken: refreshToken, result });
        return result;
    }
}
