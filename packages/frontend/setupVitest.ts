import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

import fetch, { Headers, Request, Response } from 'node-fetch';

globalThis.fetch = fetch;
globalThis.Headers = Headers;
globalThis.Request = Request;
globalThis.Response = Response;

// runs a clean after each test case (e.g. clearing jsdom)
afterEach(() => {
    cleanup();
});
