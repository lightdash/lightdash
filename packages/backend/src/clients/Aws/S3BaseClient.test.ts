import type { S3ClientConfig } from '@aws-sdk/client-s3';
import { S3BaseConfiguration } from './S3BaseClient';

// Mocks
jest.mock('../../logging/logger', () => ({
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
}));

type CredentialProviderMock = { __type: string };
// createCredentialChain will capture providers into the returned object for assertions
let capturedProviders: CredentialProviderMock[] | undefined;
const mockFromEnv = jest.fn(() => ({ __type: 'env' }));
const mockFromTokenFile = jest.fn(() => ({ __type: 'token_file' }));
const mockFromIni = jest.fn(() => ({ __type: 'ini' }));
const mockFromContainerMetadata = jest.fn(() => ({
    __type: 'container_metadata',
}));
const mockFromInstanceMetadata = jest.fn(() => ({
    __type: 'instance_metadata',
}));

jest.mock('@aws-sdk/credential-providers', () => ({
    createCredentialChain: (...args: CredentialProviderMock[]) => {
        capturedProviders = args;
        return { __type: 'chain', __providers: args };
    },
    fromEnv: () => mockFromEnv(),
    fromTokenFile: () => mockFromTokenFile(),
    fromIni: () => mockFromIni(),
    fromContainerMetadata: () => mockFromContainerMetadata(),
    fromInstanceMetadata: () => mockFromInstanceMetadata(),
}));

const mockS3Constructor = jest.fn();

class FakeS3 {
    constructor(config: S3ClientConfig) {
        mockS3Constructor(config);
    }
}

jest.mock('@aws-sdk/client-s3', () => ({
    S3: FakeS3,
}));

// Load the class under test after setting up mocks
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { S3BaseClient } = require('./S3BaseClient');

// Helper to access protected s3 instance
class TestableS3Client extends S3BaseClient {
    // eslint-disable-next-line @typescript-eslint/no-useless-constructor
    constructor(configuration: S3BaseConfiguration) {
        super(configuration);
    }

    public getS3() {
        // Access protected member for testing via subclass exposure
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        return this.s3;
    }
}

describe('S3BaseClient', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        capturedProviders = undefined;
    });

    const baseConfig: S3BaseConfiguration = {
        endpoint: 'https://s3.example.com',
        region: 'us-east-1',
        forcePathStyle: true,
        expirationTime: 123,
    };

    it('does not create S3 client when configuration is missing', () => {
        const client = new TestableS3Client(undefined);
        expect(client.getS3()).toBeUndefined();

        const clientNoEndpoint = new TestableS3Client({ region: 'us-east-1' });
        expect(clientNoEndpoint.getS3()).toBeUndefined();

        const clientNoRegion = new TestableS3Client({ endpoint: 'http://x' });
        expect(clientNoRegion.getS3()).toBeUndefined();

        // eslint-disable-next-line
        const logger = require('../../logging/logger');
        expect(logger.debug).toHaveBeenCalledWith(
            'Missing S3 bucket configuration',
        );
        // Ensure S3 constructor was never called
        expect(mockS3Constructor).not.toHaveBeenCalled();
    });

    it('creates S3 client with explicit access/secret key credentials', () => {
        const client = new TestableS3Client({
            ...baseConfig,
            accessKey: 'AKIA',
            secretKey: 'SECRET',
        });
        expect(client.getS3()).toBeInstanceOf(FakeS3);
        expect(mockS3Constructor).toHaveBeenCalledTimes(1);
        const passedConfig = mockS3Constructor.mock.calls[0][0];
        expect(passedConfig).toMatchObject({
            region: 'us-east-1',
            apiVersion: '2006-03-01',
            endpoint: 'https://s3.example.com',
            forcePathStyle: true,
        });
        expect(passedConfig.credentials).toEqual({
            accessKeyId: 'AKIA',
            secretAccessKey: 'SECRET',
        });
        // eslint-disable-next-line
        const logger = require('../../logging/logger');
        expect(logger.debug).toHaveBeenCalledWith(
            'Using S3 storage with access key credentials',
        );
    });

    it('creates S3 client with explicit credential chain when useCredentialsFrom contains valid providers in order', () => {
        const client = new TestableS3Client({
            ...baseConfig,
            useCredentialsFrom: [
                'env',
                'token_file',
                'ini',
                'ecs',
                'ec2',
            ] as const,
        });
        expect(client.getS3()).toBeInstanceOf(FakeS3);
        expect(mockS3Constructor).toHaveBeenCalledTimes(1);

        // Providers captured in order by our mocked createCredentialChain
        expect(capturedProviders).toBeDefined();
        expect(capturedProviders?.map((p) => p.__type)).toEqual([
            'env',
            'token_file',
            'ini',
            'container_metadata', // ecs alias
            'instance_metadata', // ec2 alias
        ]);

        const passedConfig = mockS3Constructor.mock.calls[0][0];
        expect(passedConfig.credentials).toEqual({
            __type: 'chain',
            __providers: capturedProviders,
        });
        // eslint-disable-next-line
        const logger = require('../../logging/logger');
        // Should log chain debug
        expect(logger.debug).toHaveBeenCalledWith(
            expect.stringContaining('credential chain'),
        );
    });

    it('ignores unknown providers and falls back to default credential resolution when none are valid', () => {
        const client = new TestableS3Client({
            ...baseConfig,
            useCredentialsFrom: ['unknown1', 'unknown2'],
        });
        expect(client.getS3()).toBeInstanceOf(FakeS3);
        // eslint-disable-next-line
        const logger = require('../../logging/logger');
        // Two warnings for the two unknown entries
        expect(logger.warn).toHaveBeenCalledTimes(2);
        // And a debug indicating default resolution
        expect(logger.debug).toHaveBeenCalledWith(
            expect.stringContaining('default AWS SDK credential resolution'),
        );

        const passedConfig = mockS3Constructor.mock.calls[0][0];
        expect(passedConfig.credentials).toBeUndefined();
        // No providers should have been captured since none were valid
        expect(capturedProviders).toBeUndefined();
    });

    it('does not set credentials when useCredentialsFrom is undefined or empty', () => {
        const client1 = new TestableS3Client({ ...baseConfig });
        const cfg1 = mockS3Constructor.mock.calls[0][0];
        expect(cfg1.credentials).toBeUndefined();

        const client2 = new TestableS3Client({
            ...baseConfig,
            useCredentialsFrom: [],
        });
        const cfg2 = mockS3Constructor.mock.calls[1][0];
        expect(cfg2.credentials).toBeUndefined();
        // eslint-disable-next-line
        const logger = require('../../logging/logger');
        expect(logger.debug).toHaveBeenCalledWith(
            expect.stringContaining('default AWS SDK credential resolution'),
        );
        expect(client1.getS3()).toBeInstanceOf(FakeS3);
        expect(client2.getS3()).toBeInstanceOf(FakeS3);
    });
});
