import {getHealthState} from "./health";
import fetchMock from "jest-fetch-mock"
import {ImagesResponse, Image} from "./health.mock";

jest.mock('../package.json', () => ({
    version: '0.1.0'
}))


describe('health', () => {
    it('Should get current and latest version', async () => {
        fetchMock.mockResponse(async () => ({body: JSON.stringify(ImagesResponse)}));

        expect(await getHealthState()).toEqual({
            healthy: true,
            version: '0.1.0',
            latest: {version: Image.name}
        })
    })
    it('Should return last version as undefined when fails fetch', async () => {
        fetchMock.mockReject();

        expect(await getHealthState()).toEqual({
            healthy: true,
            version: '0.1.0',
            latest: {version: undefined}
        })
    })
})
