import { vi } from 'vitest';

type MockResponseInit = {
    headers?: HeadersInit;
    status?: number;
};

const createResponse = (body: string, init: MockResponseInit = {}) =>
    new Response(body, {
        headers: init.headers,
        status: init.status ?? 200,
    });

type FetchMock = ReturnType<typeof vi.fn> & {
    mockReject: () => void;
    mockResponse: (
        body:
            | string
            | (() => Promise<{ body: string; init?: MockResponseInit }>),
        init?: MockResponseInit,
    ) => void;
    mockResponseOnce: (body: string, init?: MockResponseInit) => void;
    resetMocks: () => void;
};

const fetchMock = vi.fn() as FetchMock;

fetchMock.mockResponse = (body, init) => {
    fetchMock.mockImplementation(async () => {
        if (typeof body === 'function') {
            const response = await body();

            return createResponse(response.body, response.init);
        }

        return createResponse(body, init);
    });
};

fetchMock.mockResponseOnce = (body, init) => {
    fetchMock.mockResolvedValueOnce(createResponse(body, init));
};

fetchMock.mockReject = () => {
    fetchMock.mockRejectedValue(new Error('Failed to fetch'));
};

fetchMock.resetMocks = () => {
    fetchMock.mockReset();
};

vi.stubGlobal('fetch', fetchMock);

export default fetchMock;
