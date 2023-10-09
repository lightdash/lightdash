import fetchMock from 'jest-fetch-mock';
import { fetchDockerHubVersion } from './DockerHub';
import { ImagesResponse } from './DockerHub.mock';

describe('DockerHub', () => {
    afterEach(() => {
        jest.clearAllMocks();
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
});
