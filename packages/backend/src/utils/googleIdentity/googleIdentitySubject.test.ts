import { createGoogleIdentitySubjectGetter } from './googleIdentitySubject';
import { tokenFor } from './googleIdentityTokenSource.mock';

const subject = '111429504119237381932';

describe('Google identity subject lookup', () => {
    test('uses a fixed audience, coalesces concurrent requests and caches success', async () => {
        const getIdToken = vi.fn(async () => tokenFor({ sub: subject }));
        const getSubject = createGoogleIdentitySubjectGetter({ getIdToken });

        await expect(
            Promise.all([getSubject(), getSubject(), getSubject()]),
        ).resolves.toEqual([subject, subject, subject]);
        await expect(getSubject()).resolves.toBe(subject);
        expect(getIdToken).toHaveBeenCalledExactlyOnceWith(
            'lightdash-subject-lookup',
        );
    });

    test('returns undefined on metadata failure and retries the next request', async () => {
        const getIdToken = vi
            .fn(async () => tokenFor({ sub: subject }))
            .mockRejectedValueOnce(new Error('metadata unavailable'));
        const getSubject = createGoogleIdentitySubjectGetter({ getIdToken });

        await expect(getSubject()).resolves.toBeUndefined();
        await expect(getSubject()).resolves.toBe(subject);
        await expect(getSubject()).resolves.toBe(subject);
        expect(getIdToken).toHaveBeenCalledTimes(2);
    });

    test.each(['invalid-token', tokenFor({}), tokenFor({ sub: 123 })])(
        'retries after a token without a usable subject: %s',
        async (token) => {
            const getIdToken = vi
                .fn(async () => tokenFor({ sub: subject }))
                .mockResolvedValueOnce(token);
            const getSubject = createGoogleIdentitySubjectGetter({
                getIdToken,
            });

            await expect(getSubject()).resolves.toBeUndefined();
            await expect(getSubject()).resolves.toBe(subject);
            expect(getIdToken).toHaveBeenCalledTimes(2);
        },
    );
});
