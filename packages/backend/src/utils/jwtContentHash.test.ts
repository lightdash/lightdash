import { generateKeyPair, SignJWT } from 'jose';
import { hashSignedJwtContent } from './jwtContentHash';

describe('hashSignedJwtContent', () => {
    it('gives re-encoded copies of one token the same hash', async () => {
        const { privateKey } = await generateKeyPair('RS256');
        const sign = (subject: string) =>
            new SignJWT({})
                .setProtectedHeader({ alg: 'RS256' })
                .setSubject(subject)
                .sign(privateKey);
        const token = await sign('one');

        expect(hashSignedJwtContent(`${token}=`)).toBe(
            hashSignedJwtContent(token),
        );
        expect(hashSignedJwtContent(`${token}!`)).toBe(
            hashSignedJwtContent(token),
        );
        expect(hashSignedJwtContent(await sign('two'))).not.toBe(
            hashSignedJwtContent(token),
        );
    });
});
