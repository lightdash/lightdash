import { nanoid } from 'nanoid';
import { createHash } from 'node:crypto';
import {
    getStoredTokenCandidates,
    isDigestForm,
    toStoredDigest,
} from './oauthTokenDigest';

it('computes the SHA-256 digest over UTF-8 bytes', () => {
    const input = `${nanoid(64)}é`;
    const expected = `sha256:${createHash('sha256').update(Buffer.from(input, 'utf8')).digest('hex')}`;
    expect(toStoredDigest(input) === expected).toBe(true);
});

it('recognizes the prefix case insensitively without trimming', () => {
    expect(isDigestForm('sha256:')).toBe(true);
    expect(isDigestForm(`SHA256:${nanoid()}`)).toBe(true);
    expect(isDigestForm(`sHa256:${nanoid()}`)).toBe(true);
    expect(isDigestForm(' sha256:')).toBe(false);
    expect(isDigestForm('sha256')).toBe(false);
    expect(isDigestForm(nanoid(64))).toBe(false);
});

it('returns exactly the presented value and its stored digest', () => {
    const input = nanoid(64);
    const candidates = getStoredTokenCandidates(input);
    expect(candidates.length).toBe(2);
    expect(candidates[0] === input).toBe(true);
    expect(candidates[1] === toStoredDigest(input)).toBe(true);
});

it('returns no candidates for any prefixed value', () => {
    for (const input of [
        'sha256:',
        `SHA256:${nanoid()}`,
        toStoredDigest(nanoid()),
    ]) {
        expect(getStoredTokenCandidates(input).length).toBe(0);
    }
});

// HTTP input is typed as a string but repeated form fields and query objects arrive as arrays or objects.
it('returns no candidates for a value that is not a string', () => {
    const real = nanoid(64);
    for (const input of [[real], [real, nanoid(64)], { k: real }, 1, true]) {
        expect(
            getStoredTokenCandidates(input as unknown as string).length,
        ).toBe(0);
    }
});
