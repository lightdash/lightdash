import type { ClaudeCodeOtelConfig } from './claudeCodeEnv';
import { resolveDataAppOtelHeaders } from './dataAppOtelAuth';

const getAccessToken = jest.fn();
const getProjectId = jest.fn();
const getClient = jest.fn();

jest.mock('googleapis', () => ({
    google: {
        auth: {
            GoogleAuth: jest.fn().mockImplementation(() => ({
                getClient: () => getClient(),
                getProjectId: () => getProjectId(),
            })),
        },
    },
}));

const gcpOtel: ClaudeCodeOtelConfig = {
    enabled: true,
    auth: 'gcp',
    endpoint: null,
    protocol: 'http/protobuf',
    headers: null,
    gcpProject: null,
};

beforeEach(() => {
    jest.clearAllMocks();
    getClient.mockResolvedValue({
        getAccessToken: () => getAccessToken(),
    });
    getAccessToken.mockResolvedValue({ token: 'wi-token' });
    getProjectId.mockResolvedValue('adc-project');
});

describe('resolveDataAppOtelHeaders', () => {
    test('returns null when telemetry is disabled', async () => {
        await expect(
            resolveDataAppOtelHeaders({ ...gcpOtel, enabled: false }),
        ).resolves.toBeNull();
    });

    test('static mode returns the configured headers verbatim', async () => {
        await expect(
            resolveDataAppOtelHeaders({
                ...gcpOtel,
                auth: 'static',
                headers: 'Authorization=Bearer my-static-token',
            }),
        ).resolves.toBe('Authorization=Bearer my-static-token');
    });

    test('static mode returns null when no headers are configured', async () => {
        await expect(
            resolveDataAppOtelHeaders({ ...gcpOtel, auth: 'static' }),
        ).resolves.toBeNull();
    });

    test('gcp mode mints a WI token and derives the project from ADC', async () => {
        await expect(resolveDataAppOtelHeaders(gcpOtel)).resolves.toBe(
            'Authorization=Bearer wi-token,X-Goog-User-Project=adc-project',
        );
        expect(getProjectId).toHaveBeenCalled();
    });

    test('gcp mode uses the configured project override instead of ADC', async () => {
        await expect(
            resolveDataAppOtelHeaders({
                ...gcpOtel,
                gcpProject: 'override-project',
            }),
        ).resolves.toBe(
            'Authorization=Bearer wi-token,X-Goog-User-Project=override-project',
        );
        expect(getProjectId).not.toHaveBeenCalled();
    });

    test('throws when no token is minted (caller treats telemetry as non-fatal)', async () => {
        getAccessToken.mockResolvedValue({ token: null });
        await expect(resolveDataAppOtelHeaders(gcpOtel)).rejects.toThrow(
            'Failed to mint a GCP access token',
        );
    });
});
