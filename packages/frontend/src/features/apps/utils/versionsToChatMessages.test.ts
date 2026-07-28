import { type ApiAppVersionSummary } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    createChatMessageFallbacks,
    versionNarrationTexts,
    versionsToChatMessages,
} from './versionsToChatMessages';

const version = (
    overrides: Partial<ApiAppVersionSummary> = {},
): ApiAppVersionSummary => ({
    version: 1,
    prompt: 'stacked bars per shipping method',
    status: 'ready',
    statusMessage: null,
    statusHistory: [],
    error: null,
    createdAt: new Date('2026-05-15T10:00:00Z'),
    statusUpdatedAt: new Date('2026-05-15T10:00:52Z'),
    createdByUser: {
        userUuid: 'u1',
        firstName: 'Katie',
        lastName: 'Jones',
    },
    resources: null,
    ...overrides,
});

const convert = (
    versions: ApiAppVersionSummary[],
    appUuid: string | undefined = 'app-1',
) => versionsToChatMessages(versions, appUuid, createChatMessageFallbacks());

describe('versionsToChatMessages', () => {
    it('returns nothing for no versions', () => {
        expect(convert([])).toEqual([]);
    });

    it('pairs each version with a user bubble and a receipt', () => {
        const [user, assistant] = convert([version()]);

        expect(user.role).toBe('user');
        expect(user.status).toBeNull();
        expect(user.content).toBe('stacked bars per shipping method');
        expect(user.userName).toBe('Katie Jones');

        expect(assistant.role).toBe('assistant');
        expect(assistant.status).toBe('ready');
        expect(assistant.version).toBe(1);
    });

    it('orders oldest first regardless of input order', () => {
        const messages = convert([
            version({ version: 3, prompt: 'third' }),
            version({ version: 1, prompt: 'first' }),
            version({ version: 2, prompt: 'second' }),
        ]);
        expect(
            messages.filter((m) => m.role === 'user').map((m) => m.content),
        ).toEqual(['first', 'second', 'third']);
    });

    it('marks failures with status error and no version', () => {
        const [, assistant] = convert([
            version({
                status: 'error',
                statusMessage: 'Build failed',
                error: 'stack trace',
            }),
        ]);

        expect(assistant.status).toBe('error');
        expect(assistant.content).toBe('Build failed');
        // A deps chip renders off `version`; a failed build has no artifacts.
        expect(assistant.version).toBeNull();
    });

    it('falls back to the detailed error when there is no status message', () => {
        const [, assistant] = convert([
            version({ status: 'error', statusMessage: null, error: 'boom' }),
        ]);
        expect(assistant.content).toBe('boom');
    });

    it('emits only a user bubble while a version is still building', () => {
        const messages = convert([version({ status: 'building' })]);
        expect(messages).toHaveLength(1);
        expect(messages[0].role).toBe('user');
    });

    it('does not mistake a ready message for a failure when appUuid is absent', () => {
        const [, assistant] = versionsToChatMessages(
            [version()],
            undefined,
            createChatMessageFallbacks(),
        );
        expect(assistant.status).toBe('ready');
        expect(assistant.appUuid).toBeNull();
    });

    it('dates the receipt to when the build finished', () => {
        const [user, assistant] = convert([version()]);
        expect(user.timestamp).toEqual(new Date('2026-05-15T10:00:00Z'));
        expect(assistant.timestamp).toEqual(new Date('2026-05-15T10:00:52Z'));
    });

    it('falls back to createdAt when the version never recorded a transition', () => {
        const [, assistant] = convert([version({ statusUpdatedAt: null })]);
        expect(assistant.timestamp).toEqual(new Date('2026-05-15T10:00:00Z'));
    });

    it('derives the ready message for prompt-less uploaded versions', () => {
        const [, first] = convert([
            version({ prompt: '', statusMessage: 'stale leftover' }),
        ]);
        expect(first.content).toBe('Your app is ready!');

        const [, later] = convert([
            version({
                version: 4,
                prompt: '',
                statusMessage: 'stale leftover',
            }),
        ]);
        expect(later.content).toBe('Version 4 is ready!');
    });

    it('prefers the version status message for prompted versions', () => {
        const [, assistant] = convert([version({ statusMessage: 'All done' })]);
        expect(assistant.content).toBe('All done');
    });

    it('reads attachments from server resources when present', () => {
        const [user] = versionsToChatMessages(
            [
                version({
                    resources: {
                        charts: [
                            {
                                chartUuid: 'c1',
                                chartName: 'Orders',
                                linkLive: true,
                            },
                        ],
                        images: [],
                        clarifications: [],
                    } as unknown as ApiAppVersionSummary['resources'],
                }),
            ],
            'app-1',
            createChatMessageFallbacks(),
        );
        expect(user.charts).toEqual([
            {
                name: 'Orders',
                uuid: 'c1',
                chartKind: undefined,
                linkLive: true,
            },
        ]);
    });

    it('falls back to session attachments for versions with no resources', () => {
        const fallbacks = createChatMessageFallbacks();
        fallbacks.charts.set('stacked bars per shipping method', [
            { name: 'Orders', uuid: 'c1' },
        ]);
        fallbacks.dashboardName.set(
            'stacked bars per shipping method',
            'Ops dashboard',
        );

        const [user] = versionsToChatMessages([version()], 'app-1', fallbacks);
        expect(user.charts).toEqual([{ name: 'Orders', uuid: 'c1' }]);
        expect(user.dashboardName).toBe('Ops dashboard');
    });

    it('attaches narration to the receipt, not the prompt', () => {
        const [user, assistant] = convert([
            version({
                statusHistory: [
                    { kind: 'thinking', message: 'Considering layout' },
                    { kind: 'tool', message: 'Creating App.tsx' },
                ] as ApiAppVersionSummary['statusHistory'],
            }),
        ]);
        expect(user.reasoning).toEqual([]);
        expect(assistant.reasoning).toEqual(['Considering layout']);
        expect(assistant.activity).toEqual(['Creating App.tsx']);
    });

    it('handles a missing author', () => {
        const [user] = convert([version({ createdByUser: null })]);
        expect(user.userName).toBeNull();
    });
});

describe('versionNarrationTexts', () => {
    it('returns nothing when there is no history', () => {
        expect(versionNarrationTexts(undefined, 'thinking')).toEqual([]);
    });

    it('collapses consecutive duplicates from a restarted stream', () => {
        const history = [
            { kind: 'thinking', message: 'a' },
            { kind: 'thinking', message: 'a' },
            { kind: 'thinking', message: 'b' },
            { kind: 'thinking', message: 'a' },
        ] as ApiAppVersionSummary['statusHistory'];
        expect(versionNarrationTexts(history, 'thinking')).toEqual([
            'a',
            'b',
            'a',
        ]);
    });

    it('keeps only the requested kind', () => {
        const history = [
            { kind: 'thinking', message: 'thought' },
            { kind: 'tool', message: 'action' },
        ] as ApiAppVersionSummary['statusHistory'];
        expect(versionNarrationTexts(history, 'tool')).toEqual(['action']);
    });
});
