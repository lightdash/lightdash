import { render, screen } from '@testing-library/react';
import { type FC } from 'react';
import { describe, expect, it, vi } from 'vitest';
import MantineProvider from '../../providers/MantineProvider';
import AppIframePreview from './AppIframePreview';

vi.mock('./hooks/useAppSdkBridge', () => ({
    useAppSdkBridge: () => ({
        handleIframeLoad: vi.fn(),
        enableInspector: vi.fn(),
        disableInspector: vi.fn(),
        enableLineage: vi.fn(),
        disableLineage: vi.fn(),
        highlightLineage: vi.fn(),
    }),
}));

vi.mock('./hooks/useIframeScreenshot', () => ({
    useIframeScreenshot: () => ({ captureScreenshot: vi.fn() }),
}));

const SRC =
    'https://preview.example/api/apps/a/versions/1/t/tok/#transport=postMessage&projectUuid=p';

type HarnessProps = {
    hostColorScheme: 'light' | 'dark';
    forceColorScheme?: 'light' | 'dark';
};

const Harness: FC<HarnessProps> = ({ hostColorScheme, forceColorScheme }) => (
    <MantineProvider forceColorScheme={hostColorScheme}>
        <AppIframePreview
            src={SRC}
            expectedPreviewOrigin="https://preview.example"
            projectUuid="p"
            appUuid="a"
            identityKey="a:1"
            forceColorScheme={forceColorScheme}
        />
    </MantineProvider>
);

const iframeSrc = (): string =>
    screen.getByTitle('App preview').getAttribute('src') ?? '';

const iframeTheme = (): string | null =>
    new URLSearchParams(iframeSrc().split('#')[1]).get('theme');

describe('AppIframePreview', () => {
    it('seeds the iframe URL with the host color scheme', () => {
        render(<Harness hostColorScheme="dark" />);
        expect(iframeTheme()).toEqual('dark');
        expect(iframeSrc()).toContain('transport=postMessage');
    });

    it('keeps the iframe URL stable when the host toggles theme (a reload would drop app state)', () => {
        const { rerender } = render(<Harness hostColorScheme="dark" />);
        const before = iframeSrc();
        // The toggle reaches the running app over the SDK bridge; re-latching
        // the URL here would reload the iframe and lose its state.
        rerender(<Harness hostColorScheme="light" />);
        expect(iframeSrc()).toEqual(before);
    });

    it('lets an explicit override win over the host scheme (scheduled renders)', () => {
        render(<Harness hostColorScheme="dark" forceColorScheme="light" />);
        expect(iframeTheme()).toEqual('light');
    });

    // No `allow-same-origin` means the app document has an opaque origin. That
    // is why outbound bridge messages target `*` and why the preview router has
    // to send CORS headers for the app's own assets — adding it here would
    // quietly change both contracts.
    it('sandboxes the iframe without allow-same-origin', () => {
        render(<Harness hostColorScheme="light" />);
        const sandbox =
            screen.getByTitle('App preview').getAttribute('sandbox') ?? '';
        expect(sandbox).not.toContain('allow-same-origin');
    });
});
