import './pgProtocolGuard';
import { DatabaseError } from 'pg-protocol/dist/messages';
import { Parser } from 'pg-protocol/dist/parser';

// Build a single pg message: 1 byte code + UInt32BE length (incl. length
// bytes, excl. code) + payload.
const buildAuthenticationMessage = (authCode: number): Buffer => {
    const codeByte = 82; // 'R' — AuthenticationResponse
    const payload = Buffer.alloc(4);
    payload.writeInt32BE(authCode, 0);
    const length = 4 + payload.length; // length field itself + payload
    const buffer = Buffer.alloc(1 + length);
    buffer.writeUInt8(codeByte, 0);
    buffer.writeUInt32BE(length, 1);
    payload.copy(buffer, 5);
    return buffer;
};

describe('pgProtocolGuard', () => {
    // Regression for https://github.com/lightdash/lightdash/issues/22098
    // Redshift IAM / Identity Center auth sends an unknown authentication
    // message code (e.g. 13). Without the guard, pg-protocol's Parser
    // throws synchronously from the TLSSocket 'data' listener, which
    // becomes an uncaught exception and crashes the backend process.
    it('converts synchronous parser errors into a DatabaseError callback', () => {
        const parser = new Parser();
        const buffer = buildAuthenticationMessage(13);
        const received: unknown[] = [];

        expect(() => {
            parser.parse(buffer, (msg) => received.push(msg));
        }).not.toThrow();

        expect(received).toHaveLength(1);
        const [msg] = received;
        expect(msg).toBeInstanceOf(DatabaseError);
        expect((msg as DatabaseError).name).toBe('error');
        expect((msg as DatabaseError).message).toMatch(
            /unsupported authentication method \(code 13\)/,
        );
        expect((msg as DatabaseError).message).toMatch(/Identity Center/);
    });

    it('passes known messages through unchanged', () => {
        const parser = new Parser();
        // Auth code 0 — AuthenticationOk
        const buffer = buildAuthenticationMessage(0);
        const received: unknown[] = [];

        parser.parse(buffer, (msg) => received.push(msg));

        expect(received).toHaveLength(1);
        expect((received[0] as { name: string }).name).toBe('authenticationOk');
    });
});
