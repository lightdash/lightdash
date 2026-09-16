import { afterEach, describe, expect, it } from 'vitest';
import { buildAiPromptRequest } from './aiPrompt';
import { createApiTransport } from './apiTransport';
import {
    mountHostContext,
    peekHostContext,
    resetHostContext,
} from './hostContext';
const result = (queryUuid: string | null) => ({ queryUuid });

describe('buildAiPromptRequest', () => {
    it('keeps only sources with a query uuid and stringifies the focus row', () => {
        expect(
            buildAiPromptRequest('app-1', {
                prompt: 'Why did returns spike?',
                sources: [
                    { result: result('q1'), label: 'Orders' },
                    { result: result(null) },
                    { result: null },
                    { result: { lineage: { 'data-ld-query': 'q2' } } },
                ],
                focus: { row: { orders_status: 'returned', n: 12, ok: null } },
            }),
        ).toEqual({
            appUuid: 'app-1',
            prompt: 'Why did returns spike?',
            sources: [
                { queryUuid: 'q1', label: 'Orders' },
                { queryUuid: 'q2', label: null },
            ],
            focus: { orders_status: 'returned', n: '12', ok: '' },
        });
    });

    it('throws when no source has loaded', () => {
        expect(() =>
            buildAiPromptRequest('app-1', {
                prompt: 'x',
                sources: [{ result: result(null) }],
            }),
        ).toThrow(/no source has a queryUuid/);
        expect(() =>
            buildAiPromptRequest('app-1', { prompt: 'x', sources: [] }),
        ).toThrow(/at least one/);
    });
});

describe('api transport aiPrompt', () => {
    it('posts to the app route and omits focus when there is none', async () => {
        const calls: unknown[] = [];
        const transport = createApiTransport(
            { apiKey: '', baseUrl: '', projectUuid: 'proj-1' },
            async <T>(method: string, path: string, body?: unknown) => {
                calls.push([method, path, body]);
                return { text: 'answer' } as T;
            },
        );
        await expect(
            transport.aiPrompt?.({
                appUuid: 'app-1',
                prompt: 'q',
                sources: [{ queryUuid: 'q1', label: null }],
                focus: null,
            }),
        ).resolves.toEqual({ text: 'answer' });
        expect(calls).toEqual([
            [
                'POST',
                '/api/v2/projects/proj-1/apps/app-1/analysis/prompt',
                { prompt: 'q', sources: [{ queryUuid: 'q1', label: null }] },
            ],
        ]);
    });
});

describe('host context', () => {
    afterEach(() => resetHostContext());

    it('reads the app uuid from the host ready handshake', () => {
        const host = {} as Window;
        mountHostContext(host);
        window.dispatchEvent(
            new MessageEvent('message', {
                data: { type: 'lightdash:sdk:ready', appUuid: 'app-1' },
                source: host,
            }),
        );
        expect(peekHostContext().appUuid).toBe('app-1');
        window.dispatchEvent(
            new MessageEvent('message', {
                data: { type: 'lightdash:sdk:ready', appUuid: 'other' },
                source: {} as Window,
            }),
        );
        expect(peekHostContext().appUuid).toBe('app-1');
    });

    it('stays null on a handshake without an app uuid', () => {
        const host = {} as Window;
        mountHostContext(host);
        window.dispatchEvent(
            new MessageEvent('message', {
                data: { type: 'lightdash:sdk:ready' },
                source: host,
            }),
        );
        expect(peekHostContext().appUuid).toBeNull();
    });
});
