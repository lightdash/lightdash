import '@testing-library/jest-dom/vitest';
import nock from 'nock';
import { afterEach, beforeAll, beforeEach, vi } from 'vitest';
import mockMatchMedia from './__mocks__/implementations/matchMedia.mock';
import mockResizeObserver from './__mocks__/implementations/resizeObserver.mock';
import ReactMarkdownPreview from './__mocks__/modules/ReactMarkdwnPreview.mock';

beforeAll(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    vi.mock('@uiw/react-markdown-preview', () => ({
        default: ReactMarkdownPreview,
    }));

    mockMatchMedia();
    mockResizeObserver();
});

// Disable all network requests by default
nock.disableNetConnect();

beforeEach(() => {
    if (!nock.isActive()) {
        nock.activate();
    }
});

const nockCleanup = () => {
    nock.cleanAll();
    nock.restore();
};

afterEach(() => {
    // Check if all nock interceptors were used
    if (!nock.isDone()) {
        console.table(
            nock.pendingMocks().map((mock) => ({ 'Pending Mocks': mock })),
            ['Pending Mocks'],
        );
        nockCleanup();
        throw new Error('Not all nock interceptors were used!');
    }
    nockCleanup();
});
