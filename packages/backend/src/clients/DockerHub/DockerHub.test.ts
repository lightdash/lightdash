import fetchMock from '../../testing/fetchMock';
import {
    fetchDockerHubVersion,
    getDockerHubVersion,
    startDockerHubVersionPolling,
    stopDockerHubVersionPolling,
} from './DockerHub';
import { ImagesResponse } from './DockerHub.mock';

vi.mock('node-fetch', async () => ({
    __esModule: true,
    default: (await import('../../testing/fetchMock')).default,
}));

describe('DockerHub', () => {
    afterEach(() => {
        stopDockerHubVersionPolling();
        vi.useRealTimers();
        vi.clearAllMocks();
    });

    beforeEach(() => {
        fetchMock.mockResponse(async () => ({
            body: JSON.stringify(ImagesResponse),
        }));
    });

    it('Should get current and latest version', async () => {
        expect(await fetchDockerHubVersion()).toEqual('0.2.7');
    });
    it('Should return last version as undefined when fails fetch', async () => {
        fetchMock.mockReject();

        expect(await fetchDockerHubVersion()).toEqual(undefined);
    });

    describe('polling', () => {
        it('does not call Docker Hub until polling is started', () => {
            expect(fetchMock).not.toHaveBeenCalled();
        });

        it('fetches on start and again every 10 minutes', async () => {
            vi.useFakeTimers();
            startDockerHubVersionPolling();
            expect(fetchMock).toHaveBeenCalledTimes(1);
            await vi.advanceTimersByTimeAsync(0);
            expect(getDockerHubVersion()).toEqual('0.2.7');

            await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
            expect(fetchMock).toHaveBeenCalledTimes(2);
        });

        it('is idempotent and stops cleanly', async () => {
            vi.useFakeTimers();
            startDockerHubVersionPolling();
            startDockerHubVersionPolling();
            expect(fetchMock).toHaveBeenCalledTimes(1);

            stopDockerHubVersionPolling();
            await vi.advanceTimersByTimeAsync(30 * 60 * 1000);
            expect(fetchMock).toHaveBeenCalledTimes(1);
        });
    });
});
