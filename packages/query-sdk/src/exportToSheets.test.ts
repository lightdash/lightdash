import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi,
    type Mock,
} from 'vitest';
import { exportToSheets } from './exportToSheets';
import type { SdkGsheetExportRequest } from './postMessageTransport';

describe('exportToSheets', () => {
    let listeners: Array<(e: MessageEvent) => void> = [];
    let posted: unknown[] = [];
    let mockParent: { postMessage: Mock };
    let mockWindow: {
        addEventListener: Mock;
        removeEventListener: Mock;
        parent: { postMessage: Mock };
        crypto: { randomUUID: () => string };
    };

    beforeEach(() => {
        listeners = [];
        posted = [];

        mockParent = {
            postMessage: vi.fn((msg) => {
                posted.push(msg);
            }),
        };

        mockWindow = {
            addEventListener: vi.fn((evt, cb) => {
                if (evt === 'message') listeners.push(cb as never);
            }),
            removeEventListener: vi.fn((evt, cb) => {
                if (evt === 'message') {
                    listeners = listeners.filter((l) => l !== cb);
                }
            }),
            parent: mockParent,
            crypto: {
                randomUUID: () =>
                    `test-uuid-${Math.random().toString(36).slice(2)}`,
            },
        };

        // Install mock window so exportToSheets sees it
        (globalThis as Record<string, unknown>).window = mockWindow;
    });

    afterEach(() => {
        delete (globalThis as Record<string, unknown>).window;
        vi.restoreAllMocks();
    });

    const reply = (id: string, data: { fileUrl?: string; error?: string }) => {
        for (const l of listeners) {
            l(
                new MessageEvent('message', {
                    data: {
                        type: 'lightdash:sdk:gsheet-export-response',
                        id,
                        ...data,
                    },
                }),
            );
        }
    };

    it('resolves with fileUrl when the parent responds successfully', async () => {
        const p = exportToSheets({
            title: 'T',
            columns: [{ key: 'a' }],
            rows: [{ a: 1 }],
        });
        const sent = posted[0] as SdkGsheetExportRequest;
        expect(sent.type).toBe('lightdash:sdk:gsheet-export-request');
        reply(sent.id, { fileUrl: 'https://sheets/abc' });
        await expect(p).resolves.toEqual({ fileUrl: 'https://sheets/abc' });
    });

    it('rejects with the parent-supplied error message', async () => {
        const p = exportToSheets({
            title: 'T',
            columns: [{ key: 'a' }],
            rows: [{ a: 1 }],
        });
        const sent = posted[0] as SdkGsheetExportRequest;
        reply(sent.id, { error: 'Google account not connected' });
        await expect(p).rejects.toThrow('Google account not connected');
    });

    it('ignores responses with mismatched ids', async () => {
        const p = exportToSheets({
            title: 'T',
            columns: [{ key: 'a' }],
            rows: [{ a: 1 }],
        });
        const sent = posted[0] as SdkGsheetExportRequest;
        reply('wrong-id', { fileUrl: 'nope' });
        reply(sent.id, { fileUrl: 'right' });
        await expect(p).resolves.toEqual({ fileUrl: 'right' });
    });
});
