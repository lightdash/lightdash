import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    SDK_FEATURE_KEYS,
    SDK_FEATURES,
    SDK_MANIFEST_MESSAGE_TYPE,
} from './features';
import { SDK_VERSION } from './generated/sdkVersion';
import { announceSdkManifest } from './manifest';

// Capability-announcement message literals → the registry key that must
// declare them. Extend this map when adding a new `*:available` message.
const AVAILABLE_MESSAGE_TO_FEATURE: Record<string, string> = {
    'lightdash:inspect:available': 'inspect',
    'lightdash:lineage:available': 'lineage',
    'lightdash:sdk:screenshot-available': 'screenshot',
};

describe('SDK_FEATURES registry', () => {
    it('has unique keys and non-empty prose', () => {
        const keys = SDK_FEATURES.map((f) => f.key);
        expect(new Set(keys).size).toEqual(keys.length);
        for (const feature of SDK_FEATURES) {
            expect(feature.key).toMatch(/^[a-z][a-z-]*$/);
            expect(feature.label.trim().length).toBeGreaterThan(0);
            expect(feature.description.trim().length).toBeGreaterThan(0);
        }
        expect(SDK_FEATURE_KEYS).toEqual(keys);
    });

    it('covers every *:available message literal in the SDK source (drift guard)', () => {
        const srcDir = dirname(fileURLToPath(import.meta.url));
        const sources = readdirSync(srcDir)
            .filter((f: string) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f))
            .map((f: string) => readFileSync(join(srcDir, f), 'utf-8'))
            .join('\n');
        const found = new Set<string>(
            sources.match(/lightdash:[a-z-]+:[a-z-]*available/g) ?? [],
        );
        expect(found.size).toBeGreaterThan(0);
        for (const literal of found) {
            const featureKey = AVAILABLE_MESSAGE_TO_FEATURE[literal];
            expect(
                featureKey,
                `Unmapped capability message "${literal}" — add it to AVAILABLE_MESSAGE_TO_FEATURE and (if new) to SDK_FEATURES`,
            ).toBeDefined();
            expect(SDK_FEATURE_KEYS).toContain(featureKey);
        }
    });

    it('SDK_VERSION matches package.json (regenerate via pnpm -F @lightdash/query-sdk prebuild)', () => {
        const pkg = JSON.parse(
            readFileSync(
                join(
                    dirname(fileURLToPath(import.meta.url)),
                    '..',
                    'package.json',
                ),
                'utf-8',
            ),
        ) as { version: string };
        expect(SDK_VERSION).toEqual(pkg.version);
    });
});

describe('announceSdkManifest', () => {
    const expectedMessage = {
        type: SDK_MANIFEST_MESSAGE_TYPE,
        sdkVersion: SDK_VERSION,
        features: SDK_FEATURE_KEYS,
    };

    let cleanup: () => void = () => {};
    afterEach(() => cleanup());

    const sendReady = (source: MessageEventSource | null) =>
        window.dispatchEvent(
            new MessageEvent('message', {
                data: { type: 'lightdash:sdk:ready' },
                source,
            }),
        );

    it('posts the manifest immediately, targeted at the serving origin', () => {
        const targetWindow = { postMessage: vi.fn() } as unknown as Window;
        cleanup = announceSdkManifest(targetWindow);
        expect(targetWindow.postMessage).toHaveBeenCalledWith(
            expectedMessage,
            window.location.origin,
        );
    });

    it('re-posts when the host announces sdk:ready', () => {
        const targetWindow = { postMessage: vi.fn() } as unknown as Window;
        cleanup = announceSdkManifest(targetWindow);
        sendReady(targetWindow as unknown as MessageEventSource);
        expect(targetWindow.postMessage).toHaveBeenCalledTimes(2);
    });

    it('ignores sdk:ready from other windows', () => {
        const targetWindow = { postMessage: vi.fn() } as unknown as Window;
        cleanup = announceSdkManifest(targetWindow);
        sendReady(null);
        expect(targetWindow.postMessage).toHaveBeenCalledTimes(1);
    });

    it('does not stack listeners when announced repeatedly', () => {
        const targetWindow = { postMessage: vi.fn() } as unknown as Window;
        announceSdkManifest(targetWindow);
        cleanup = announceSdkManifest(targetWindow);
        sendReady(targetWindow as unknown as MessageEventSource);
        // 2 immediate posts + exactly 1 ready re-post (not one per announce)
        expect(targetWindow.postMessage).toHaveBeenCalledTimes(3);
    });

    it('stops re-posting after cleanup', () => {
        const targetWindow = { postMessage: vi.fn() } as unknown as Window;
        cleanup = announceSdkManifest(targetWindow);
        cleanup();
        sendReady(targetWindow as unknown as MessageEventSource);
        expect(targetWindow.postMessage).toHaveBeenCalledTimes(1);
    });
});
