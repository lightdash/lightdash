import { ParameterError } from '@lightdash/common';
import {
    classifyResourceUrl,
    parseOpenGraph,
    parseYoutubeOembed,
} from './homepageLinkMetadata';

describe('classifyResourceUrl', () => {
    it('classifies Claude artifact URLs as html/claude', () => {
        const result = classifyResourceUrl(
            'https://claude.ai/public/artifacts/06c4efcb-9c37-4649-8f04-1c0c233555bb',
        );
        expect(result.kind).toBe('claude');
        expect(result.fetchKind).toBe('html');
    });

    it('classifies claude.ai subdomains', () => {
        expect(classifyResourceUrl('https://www.claude.ai/x').kind).toBe(
            'claude',
        );
    });

    it('classifies youtube.com / youtu.be as oembed/youtube', () => {
        const watch = classifyResourceUrl(
            'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        );
        expect(watch.kind).toBe('youtube');
        expect(watch.fetchKind).toBe('oembed');
        expect(watch.fetchUrl).toContain('youtube.com/oembed');
        expect(watch.fetchUrl).toContain(
            encodeURIComponent('https://www.youtube.com/watch?v=dQw4w9WgXcQ'),
        );

        expect(classifyResourceUrl('https://youtu.be/dQw4w9WgXcQ').kind).toBe(
            'youtube',
        );
    });

    it('rejects hosts outside the allowlist', () => {
        expect(() => classifyResourceUrl('https://evil.example.com')).toThrow(
            ParameterError,
        );
        // SSRF: internal targets must never be reachable
        expect(() => classifyResourceUrl('http://169.254.169.254/')).toThrow(
            ParameterError,
        );
        expect(() => classifyResourceUrl('http://localhost:8080')).toThrow(
            ParameterError,
        );
        // look-alike host must not slip past the suffix check
        expect(() => classifyResourceUrl('https://notclaude.ai')).toThrow(
            ParameterError,
        );
        expect(() => classifyResourceUrl('https://claude.ai.evil.com')).toThrow(
            ParameterError,
        );
    });

    it('rejects non-https protocols (incl. http to an allowlisted host)', () => {
        expect(() => classifyResourceUrl('file:///etc/passwd')).toThrow(
            ParameterError,
        );
        expect(() => classifyResourceUrl('not a url')).toThrow(ParameterError);
        expect(() => classifyResourceUrl('http://claude.ai/x')).toThrow(
            ParameterError,
        );
    });
});

describe('parseOpenGraph', () => {
    // Real tags served by Claude public artifact pages (verified 2026-07-16).
    const paletteLab = `<head>
        <meta property="og:title" content="Palette Lab: Generate Color Palettes for Design">
        <meta property="og:description" content="Create categorical, sequential, and diverging color palettes with interactive controls.">
        <meta property="og:image" content="https://claude.ai/images/claude_ogimage.png">
        <title>Claude</title>
    </head>`;

    it('extracts real per-artifact title and description + generic image', () => {
        expect(parseOpenGraph(paletteLab)).toEqual({
            title: 'Palette Lab: Generate Color Palettes for Design',
            description:
                'Create categorical, sequential, and diverging color palettes with interactive controls.',
            imageUrl: 'https://claude.ai/images/claude_ogimage.png',
        });
    });

    it('handles content-before-property attribute order', () => {
        const html = `<meta content="Regex Tester - Live JavaScript Pattern Matcher" property="og:title">`;
        expect(parseOpenGraph(html).title).toBe(
            'Regex Tester - Live JavaScript Pattern Matcher',
        );
    });

    it('decodes HTML entities in content', () => {
        const html = `<meta property="og:title" content="Sales &amp; Ops &#39;24">`;
        expect(parseOpenGraph(html).title).toBe("Sales & Ops '24");
    });

    it('falls back to <title> when og:title is absent', () => {
        const html = `<head><title>Just a title</title></head>`;
        expect(parseOpenGraph(html).title).toBe('Just a title');
    });

    it('returns nulls when nothing matches', () => {
        expect(parseOpenGraph('<html></html>')).toEqual({
            title: null,
            description: null,
            imageUrl: null,
        });
    });
});

describe('parseYoutubeOembed', () => {
    it('maps oembed fields to metadata (channel as description)', () => {
        expect(
            parseYoutubeOembed({
                title: 'Never Gonna Give You Up',
                author_name: 'Rick Astley',
                thumbnail_url:
                    'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
            }),
        ).toEqual({
            title: 'Never Gonna Give You Up',
            description: 'Rick Astley',
            imageUrl: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
        });
    });

    it('returns nulls for non-object / empty payloads', () => {
        expect(parseYoutubeOembed(null)).toEqual({
            title: null,
            description: null,
            imageUrl: null,
        });
        expect(parseYoutubeOembed({})).toEqual({
            title: null,
            description: null,
            imageUrl: null,
        });
    });
});
