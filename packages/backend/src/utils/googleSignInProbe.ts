import {
    getBigqueryKeyfileCredentials,
    getWarehouseSignInRejection,
    type WarehouseSignInRejection,
} from '@lightdash/common';
import { getGoogleOauthTokenError } from '@lightdash/warehouses';
import { createHash } from 'crypto';
import { GoogleAuth } from 'google-auth-library';

type Status = {
    expired: boolean | undefined;
    rejection?: WarehouseSignInRejection;
};

export class GoogleSignInProbe {
    private readonly entries = new Map<
        string,
        { until: number; result: Promise<Status> }
    >();

    async check(
        keyfile: Record<string, string>,
        incarnation: Buffer | string,
    ): Promise<Status> {
        const key = createHash('sha256')
            .update(incarnation)
            .update(JSON.stringify(keyfile))
            .digest('hex');
        const cached = this.entries.get(key);
        if (cached && cached.until > Date.now()) return cached.result;
        const result = this.probe(keyfile);
        this.entries.delete(key);
        this.entries.set(key, { until: Date.now() + 60_000, result });
        if (this.entries.size > 100)
            this.entries.delete(this.entries.keys().next().value!);
        return result;
    }

    private async probe(keyfile: Record<string, string>): Promise<Status> {
        try {
            await new GoogleAuth({
                credentials: getBigqueryKeyfileCredentials(keyfile),
                scopes: ['https://www.googleapis.com/auth/bigquery'],
                clientOptions: {
                    transporterOptions: { timeout: 10_000, retry: false },
                },
            }).getAccessToken();
            return { expired: false };
        } catch (error) {
            const tokenError = getGoogleOauthTokenError(error);
            const rejection =
                tokenError &&
                getWarehouseSignInRejection(
                    tokenError.error,
                    tokenError.errorSubtype,
                );
            return rejection
                ? { expired: true, rejection }
                : { expired: undefined };
        }
    }
}
