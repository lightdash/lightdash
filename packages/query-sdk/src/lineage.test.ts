import { describe, expect, it, beforeEach, vi } from 'vitest';
import {
    resolveLineageTarget,
    applyHighlight,
    clearHighlight,
} from './lineage';

beforeEach(() => {
    document.body.innerHTML = '';
});

describe('resolveLineageTarget', () => {
    it('returns the queryUuid from the nearest stamped ancestor', () => {
        document.body.innerHTML =
            '<div data-ld-query="q-1"><span id="cell">$1.2M</span></div>';
        const cell = document.getElementById('cell');
        expect(resolveLineageTarget(cell)).toBe('q-1');
    });

    it('returns null when no stamped ancestor exists', () => {
        document.body.innerHTML = '<div><span id="cell">x</span></div>';
        expect(
            resolveLineageTarget(document.getElementById('cell')),
        ).toBeNull();
    });

    it('returns null for a null element', () => {
        expect(resolveLineageTarget(null)).toBeNull();
    });
});

describe('applyHighlight / clearHighlight', () => {
    it('outlines all elements matching the queryUuid and clears them', () => {
        document.body.innerHTML =
            '<div data-ld-query="q-1" id="a"></div>' +
            '<div data-ld-query="q-1" id="b"></div>' +
            '<div data-ld-query="q-2" id="c"></div>';
        applyHighlight('q-1');
        expect(document.getElementById('a')!.style.outline).not.toBe('');
        expect(document.getElementById('b')!.style.outline).not.toBe('');
        expect(document.getElementById('c')!.style.outline).toBe('');
        clearHighlight();
        expect(document.getElementById('a')!.style.outline).toBe('');
    });

    it('clearing happens automatically when applying a new/null target', () => {
        document.body.innerHTML = '<div data-ld-query="q-1" id="a"></div>';
        applyHighlight('q-1');
        applyHighlight(null);
        expect(document.getElementById('a')!.style.outline).toBe('');
    });
});

describe('mountLineage availability announcement', () => {
    // mountLineage keeps module-level mount state, so each test gets a fresh
    // module instance via dynamic import.
    const loadMountLineage = async () => {
        vi.resetModules();
        const { mountLineage } = await import('./lineage');
        return mountLineage;
    };

    // MutationObserver callbacks are delivered async; flush them.
    const flushObservers = () => new Promise((r) => setTimeout(r, 0));

    const availableMessages = (parent: {
        postMessage: ReturnType<typeof vi.fn>;
    }) =>
        parent.postMessage.mock.calls.filter(
            ([msg]) => msg?.type === 'lightdash:lineage:available',
        );

    const makeParent = () => ({ postMessage: vi.fn() });

    it('does not announce when the app has no [data-ld-query] elements', async () => {
        const mountLineage = await loadMountLineage();
        const parent = makeParent();
        mountLineage(parent as unknown as Window);
        await flushObservers();
        expect(availableMessages(parent)).toHaveLength(0);
    });

    it('announces immediately when a stamped element already exists', async () => {
        const mountLineage = await loadMountLineage();
        document.body.innerHTML = '<div data-ld-query="q-1"></div>';
        const parent = makeParent();
        mountLineage(parent as unknown as Window);
        expect(availableMessages(parent)).toHaveLength(1);
    });

    it('announces when a stamped element is added after mount', async () => {
        const mountLineage = await loadMountLineage();
        const parent = makeParent();
        mountLineage(parent as unknown as Window);
        expect(availableMessages(parent)).toHaveLength(0);

        const el = document.createElement('div');
        el.setAttribute('data-ld-query', 'q-1');
        document.body.appendChild(el);
        await flushObservers();
        expect(availableMessages(parent)).toHaveLength(1);
    });

    it('announces when data-ld-query is set on an existing element after mount', async () => {
        const mountLineage = await loadMountLineage();
        document.body.innerHTML = '<div id="late"></div>';
        const parent = makeParent();
        mountLineage(parent as unknown as Window);
        expect(availableMessages(parent)).toHaveLength(0);

        document.getElementById('late')!.setAttribute('data-ld-query', 'q-1');
        await flushObservers();
        expect(availableMessages(parent)).toHaveLength(1);
    });

    it('announces only once even when more stamps appear later', async () => {
        const mountLineage = await loadMountLineage();
        const parent = makeParent();
        mountLineage(parent as unknown as Window);

        for (const uuid of ['q-1', 'q-2']) {
            const el = document.createElement('div');
            el.setAttribute('data-ld-query', uuid);
            document.body.appendChild(el);
            await flushObservers();
        }
        expect(availableMessages(parent)).toHaveLength(1);
    });
});
