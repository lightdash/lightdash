import type {
    RefreshRowKey,
    RefreshRun,
    RefreshTokenRotation,
} from '../../models/RefreshTokenRotation/RefreshTokenRotation';

export type SnowflakeTokenExchange = {
    accessToken: string;
    refreshToken: string;
};

export class SnowflakeOAuthRefresher {
    constructor(private readonly rotation: Pick<RefreshTokenRotation, 'run'>) {}

    async refresh<R extends SnowflakeTokenExchange>({
        refreshToken,
        row,
        exchange,
        persist,
    }: {
        refreshToken: string;
        row: {
            key: RefreshRowKey;
            shareKey: string;
            readCurrentRefreshToken: () => Promise<string | null>;
        } | null;
        exchange: RefreshRun<R>['exchange'];
        persist: RefreshRun<R>['persist'];
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
