import { ForbiddenError } from '@lightdash/common';
import { createHmac } from 'crypto';
import jwt from 'jsonwebtoken';
import {
    CSV_UPLOAD_TOKEN_MAX_AGE_SECONDS,
    mintCsvUploadToken,
    verifyCsvUploadToken,
} from './csvUploadToken';

const claims = {
    projectUuid: 'project-uuid',
    sourceUuid: 'source-uuid',
    userUuid: 'user-uuid',
    sizeBytes: 1024,
};

const secrets = (active: string, fallbacks: string[] = []) => ({
    active,
    fallbacks,
    all: [active, ...fallbacks],
});

describe('csv upload token', () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it('round-trips its claims and expires after five minutes', () => {
        vi.useFakeTimers({ now: new Date('2026-11-24T12:00:00Z') });

        const { token, expiresAt } = mintCsvUploadToken(
            secrets('secret-a'),
            claims,
        );

        expect(verifyCsvUploadToken(token, secrets('secret-a'))).toEqual(
            claims,
        );
        expect(expiresAt.toISOString()).toBe(
            new Date(
                Date.parse('2026-11-24T12:00:00Z') +
                    CSV_UPLOAD_TOKEN_MAX_AGE_SECONDS * 1000,
            ).toISOString(),
        );
    });

    it('accepts a token signed by a fallback secret during rotation', () => {
        const { token } = mintCsvUploadToken(secrets('old-secret'), claims);

        expect(
            verifyCsvUploadToken(token, secrets('new-secret', ['old-secret'])),
        ).toEqual(claims);
    });

    it('says an expired token has expired', () => {
        vi.useFakeTimers({ now: new Date('2026-11-24T12:00:00Z') });
        const { token } = mintCsvUploadToken(secrets('secret-a'), claims);
        vi.setSystemTime(new Date('2026-11-24T12:05:01Z'));

        expect(() => verifyCsvUploadToken(token, secrets('secret-a'))).toThrow(
            new ForbiddenError(
                'This upload link has expired. Prepare the upload again.',
            ),
        );
    });

    it.each([
        ['missing', undefined],
        ['signed by an unknown secret', 'unknown'],
        ['tampered', 'tampered'],
        ['for another purpose', 'other-purpose'],
    ])('rejects a token that is %s', (_label, kind) => {
        const { token } = mintCsvUploadToken(secrets('secret-a'), claims);
        const candidates: Record<string, string | undefined> = {
            unknown: mintCsvUploadToken(secrets('secret-b'), claims).token,
            tampered: `${token.slice(0, -2)}xx`,
            // Correctly signed, so only the type claim rejects it.
            'other-purpose': jwt.sign(
                { ...claims, type: 'app-preview' },
                createHmac('sha256', 'secret-a')
                    .update('csv-upload-token')
                    .digest(),
                { audience: 'csv-upload', issuer: 'lightdash', expiresIn: 60 },
            ),
        };

        expect(() =>
            verifyCsvUploadToken(
                kind === undefined ? undefined : candidates[kind],
                secrets('secret-a'),
            ),
        ).toThrow(ForbiddenError);
    });
});
