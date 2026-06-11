import './pgProtocolGuard';
import * as net from 'net';
import { Client } from 'pg';

// Builds a full AuthenticationResponse wire message with the given sub-code.
// Byte layout: 'R' (0x52) + Int32 length (includes length bytes, excludes
// code) + Int32 sub-code. Mirrors what the Redshift server sends for IAM
// Identity Center auth (sub-code 13) before pg-protocol's Parser throws.
const buildAuthTypeMessage = (subCode: number): Buffer => {
    const buffer = Buffer.alloc(9);
    buffer.writeUInt8(0x52, 0); // 'R'
    buffer.writeUInt32BE(8, 1); // length
    buffer.writeInt32BE(subCode, 5);
    return buffer;
};

const startFakePostgresServer = (subCode: number): Promise<net.Server> =>
    new Promise((resolve) => {
        const server = net.createServer((socket) => {
            // Swallow the client's startup packet, then send the bad auth
            // message. We only need one data event to kick it off.
            socket.once('data', () => {
                socket.write(buildAuthTypeMessage(subCode));
            });
            socket.on('error', () => {
                /* ignore — client may RST after we send garbage */
            });
        });
        server.listen(0, '127.0.0.1', () => resolve(server));
    });

describe('pgProtocolGuard (integration)', () => {
    // End-to-end regression for https://github.com/lightdash/lightdash/issues/22098.
    // Without the guard, pg-protocol throws synchronously inside the socket's
    // 'data' listener, which becomes an uncaught exception and crashes the
    // Node process. With the guard, the same scenario rejects pg.Client's
    // connect() promise cleanly.
    it('rejects pg.Client.connect() instead of crashing the process', async () => {
        const server = await startFakePostgresServer(13);
        const address = server.address();
        if (!address || typeof address === 'string') {
            throw new Error('fake server did not bind to a TCP address');
        }

        const client = new Client({
            host: '127.0.0.1',
            port: address.port,
            user: 'anything',
            password: 'anything',
            database: 'anything',
            ssl: false,
        });

        try {
            await expect(client.connect()).rejects.toThrow(
                /unsupported authentication method \(code 13\).*Identity Center/,
            );
        } finally {
            await client.end().catch(() => {});
            await new Promise<void>((resolve) => {
                server.close(() => resolve());
            });
        }
    });
});
