import { execSync } from 'child_process';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { EncryptionUtil } from './EncryptionUtil';

test('Message is unchanged by encryption and decryption', () => {
    const service = new EncryptionUtil({
        lightdashConfig: { lightdashSecret: 'secret' },
    });
    const message = 'extremely secret';
    expect(service.decrypt(service.encrypt(message))).toStrictEqual(message);
});

describe('EncryptionUtil.isKeyEncrypted', () => {
    // Generate test keys for consistent testing
    let unencryptedPrivateKey: string;
    let encryptedPrivateKeyPKCS8: string;
    let encryptedPrivateKeyPKCS1: string;
    let encryptedOpenSSHKey: string;
    let tempDir: string;

    beforeAll(() => {
        // Create temporary directory for SSH key generation
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'keytest-'));
        // Generate an unencrypted RSA private key (PKCS8 format)
        const { privateKey } = crypto.generateKeyPairSync('rsa', {
            modulusLength: 2048,
            privateKeyEncoding: {
                type: 'pkcs8',
                format: 'pem',
            },
            publicKeyEncoding: {
                type: 'spki',
                format: 'pem',
            },
        });
        unencryptedPrivateKey = privateKey;

        // Generate an encrypted RSA private key (PKCS8 format)
        const { privateKey: encryptedPKCS8 } = crypto.generateKeyPairSync(
            'rsa',
            {
                modulusLength: 2048,
                privateKeyEncoding: {
                    type: 'pkcs8',
                    format: 'pem',
                    cipher: 'aes-256-cbc',
                    passphrase: 'test-passphrase',
                },
                publicKeyEncoding: {
                    type: 'spki',
                    format: 'pem',
                },
            },
        );
        encryptedPrivateKeyPKCS8 = encryptedPKCS8;

        // Generate an encrypted RSA private key (PKCS1 format with Proc-Type header)
        // Note: Node's crypto doesn't directly support PKCS1 encrypted format generation,
        // so we'll create a mock for testing header detection
        encryptedPrivateKeyPKCS1 = `-----BEGIN RSA PRIVATE KEY-----
Proc-Type: 4,ENCRYPTED
DEK-Info: AES-256-CBC,1234567890ABCDEF1234567890ABCDEF

MIIEpAIBAAKCAQEA1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890
ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ
-----END RSA PRIVATE KEY-----`;

        // Generate an encrypted OpenSSH format key
        // OpenSSH keys don't have explicit encryption headers - encryption is detected via parsing
        const sshKeyPath = path.join(tempDir, 'test_openssh_key');
        try {
            // Generate encrypted OpenSSH key with passphrase (default format is OpenSSH)
            execSync(
                `ssh-keygen -t ed25519 -f "${sshKeyPath}" -N "test-passphrase" -C "test@example.com"`,
                { stdio: 'pipe' },
            );
            encryptedOpenSSHKey = fs.readFileSync(sshKeyPath, 'utf-8');
        } catch (error) {
            // If ssh-keygen is not available, skip - we'll handle this in the test
            encryptedOpenSSHKey = '';
        }
    });

    afterAll(() => {
        // Clean up temporary directory
        try {
            fs.rmSync(tempDir, { recursive: true, force: true });
        } catch (error) {
            // Ignore cleanup errors
        }
    });

    describe('unencrypted keys', () => {
        it('should return false for unencrypted PKCS8 private key', () => {
            const result = EncryptionUtil.isKeyEncrypted(unencryptedPrivateKey);
            expect(result).toBe(false);
        });

        it('should return false for unencrypted key that can be parsed', () => {
            // This key should parse successfully without a passphrase
            const result = EncryptionUtil.isKeyEncrypted(unencryptedPrivateKey);
            expect(result).toBe(false);
        });
    });

    describe('encrypted keys', () => {
        it('should return true for encrypted PKCS8 private key via header detection', () => {
            const result = EncryptionUtil.isKeyEncrypted(
                encryptedPrivateKeyPKCS8,
            );
            expect(result).toBe(true);
        });

        it('should return true for encrypted key with "BEGIN ENCRYPTED PRIVATE KEY" header', () => {
            expect(encryptedPrivateKeyPKCS8).toContain(
                '-----BEGIN ENCRYPTED PRIVATE KEY-----',
            );
            const result = EncryptionUtil.isKeyEncrypted(
                encryptedPrivateKeyPKCS8,
            );
            expect(result).toBe(true);
        });

        it('should return true for encrypted key with "Proc-Type: 4,ENCRYPTED" header', () => {
            const result = EncryptionUtil.isKeyEncrypted(
                encryptedPrivateKeyPKCS1,
            );
            expect(result).toBe(true);
        });

        it('should return true for encrypted OpenSSH key without explicit encryption headers', () => {
            // Skip test if ssh-keygen was not available during key generation
            if (!encryptedOpenSSHKey) {
                console.warn(
                    'Skipping OpenSSH encrypted key test - ssh-keygen not available',
                );
                return;
            }

            // OpenSSH format keys don't have "BEGIN ENCRYPTED" or "Proc-Type" headers
            // Encryption must be detected by attempting to parse the key
            expect(encryptedOpenSSHKey).not.toContain('ENCRYPTED');
            expect(encryptedOpenSSHKey).not.toContain('Proc-Type');
            expect(encryptedOpenSSHKey).toContain(
                '-----BEGIN OPENSSH PRIVATE KEY-----',
            );

            const result = EncryptionUtil.isKeyEncrypted(encryptedOpenSSHKey);
            expect(result).toBe(true);
        });
    });

    describe('invalid inputs', () => {
        it('should throw error for empty string', () => {
            expect(() => EncryptionUtil.isKeyEncrypted('')).toThrow(
                'Invalid key content: must be a non-empty string',
            );
        });
    });

    describe('invalid key content', () => {
        it('should throw error for random text that is not a valid key', () => {
            const invalidKey = 'this is not a valid private key';
            expect(() => EncryptionUtil.isKeyEncrypted(invalidKey)).toThrow(
                'Unable to parse private key',
            );
        });

        it('should throw error for malformed PEM', () => {
            const malformedKey = `-----BEGIN PRIVATE KEY-----
INVALID_BASE64_CONTENT!!!
-----END PRIVATE KEY-----`;
            expect(() => EncryptionUtil.isKeyEncrypted(malformedKey)).toThrow(
                'Unable to parse private key',
            );
        });

        it('should throw error for incomplete PEM structure', () => {
            const incompleteKey = '-----BEGIN PRIVATE KEY-----';
            expect(() => EncryptionUtil.isKeyEncrypted(incompleteKey)).toThrow(
                'Unable to parse private key',
            );
        });
    });

    describe('edge cases', () => {
        it('should handle key with extra whitespace', () => {
            const keyWithWhitespace = `  \n${unencryptedPrivateKey}\n  `;
            const result = EncryptionUtil.isKeyEncrypted(keyWithWhitespace);
            expect(result).toBe(false);
        });

        it('should handle key with Windows line endings', () => {
            const keyWithCRLF = unencryptedPrivateKey.replace(/\n/g, '\r\n');
            const result = EncryptionUtil.isKeyEncrypted(keyWithCRLF);
            expect(result).toBe(false);
        });

        it('should correctly identify encrypted key regardless of line endings', () => {
            const keyWithCRLF = encryptedPrivateKeyPKCS8.replace(/\n/g, '\r\n');
            const result = EncryptionUtil.isKeyEncrypted(keyWithCRLF);
            expect(result).toBe(true);
        });
    });
});
