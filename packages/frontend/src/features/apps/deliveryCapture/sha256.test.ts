import { describe, expect, it } from 'vitest';
import { sha256Hex } from './sha256';

describe('sha256Hex', () => {
    // Digests from the NIST test vectors / `shasum -a 256`. The lengths cover
    // both sides of the 55/56-byte padding boundary and multi-block input.
    const vectors: Array<[name: string, input: string, digest: string]> = [
        [
            'empty string',
            '',
            'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        ],
        [
            'abc',
            'abc',
            'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
        ],
        [
            '56-byte NIST vector',
            'abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq',
            '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
        ],
        [
            '55 bytes (largest single-block payload)',
            'a'.repeat(55),
            '9f4390f8d30c2dd92ec9f095b65e2b9ae9b0a925a5258e241c9f1e910f734318',
        ],
        [
            '56 bytes (padding spills into a second block)',
            'a'.repeat(56),
            'b35439a4ac6f0948b6d6f9e3c6af0f5f590ce20f1bde7090ef7970686ec6738a',
        ],
        [
            '64 bytes (exactly one block)',
            'a'.repeat(64),
            'ffe054fe7ae0cb6dc65c3af9b61d5209f439851db43d0ba5997337df154668eb',
        ],
        [
            '1000 bytes (many blocks)',
            'a'.repeat(1000),
            '41edece42d63e8d9bf515a9ba6932e1c20cbc9f5a5d134645adb5db1b9737ea3',
        ],
        [
            'non-ASCII input is hashed as UTF-8',
            'héllo 🌍 — ünïcødé',
            '15894bb8345dd73761c2610b45ec6215f2049d93d310df8720077ddd40fd62f3',
        ],
    ];

    it.each(vectors)(
        'matches the known digest for %s',
        (_name, input, digest) => {
            expect(sha256Hex(input)).toBe(digest);
        },
    );

    it('is deterministic and collision-free for near-identical inputs', () => {
        expect(sha256Hex('query-a')).toBe(sha256Hex('query-a'));
        expect(sha256Hex('query-a')).not.toBe(sha256Hex('query-b'));
    });

    it('does not use crypto.subtle', () => {
        const { subtle } = globalThis.crypto;
        Object.defineProperty(globalThis.crypto, 'subtle', {
            value: undefined,
            configurable: true,
        });
        try {
            expect(sha256Hex('abc')).toBe(
                'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
            );
        } finally {
            Object.defineProperty(globalThis.crypto, 'subtle', {
                value: subtle,
                configurable: true,
            });
        }
    });
});
