import { afterEach, describe, expect, it } from 'vitest';
import { buildAiPromptRequest } from './aiPrompt';
import {
    mountHostContext,
    peekHostContext,
    resetHostContext,
} from './hostContext';
import type { QueryResult } from './types';

const result = (queryUuid?: string): QueryResult => ({
    rows: [],
    columns: [],
    format: () => '',
    queryUuid,
});

describe('buildAiPromptRequest', () => {
    it('keeps only sources with a query uuid and stringifies the focus row', () => {
        expect(
            buildAiPromptRequest('app-1', {
                prompt: 'Why did returns spike?',
                sources: [
                    { result: result('q1'), label: 'Orders' },
                    { result: result(undefined) },
                    { result: result('q2') },
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
                sources: [{ result: result(undefined) }],
            }),
        ).toThrow(/at least one loaded/);
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
