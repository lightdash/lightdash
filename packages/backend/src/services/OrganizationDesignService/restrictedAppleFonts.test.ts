import {
    makeOversizedTestWoff2Font,
    makeTestTrueTypeFont,
    makeTestWoff2Font,
    makeTestWoffFont,
} from '../../testing/makeTestTrueTypeFont';
import {
    APPLE_MONO_SYSTEM_FONT_STACK,
    APPLE_SANS_SYSTEM_FONT_STACK,
    APPLE_SERIF_SYSTEM_FONT_STACK,
    classifyRestrictedAppleFont,
    inspectAppleFont,
} from './restrictedAppleFonts';

describe('restricted Apple font policy', () => {
    it.each([
        ['SF Pro Display', APPLE_SANS_SYSTEM_FONT_STACK],
        ['SFCompactText-Regular', APPLE_SANS_SYSTEM_FONT_STACK],
        ['.SF NS Text', APPLE_SANS_SYSTEM_FONT_STACK],
        ['SFNSDisplay-Regular', APPLE_SANS_SYSTEM_FONT_STACK],
        ['SF Arabic Rounded', APPLE_SANS_SYSTEM_FONT_STACK],
        ['SFMono-Regular', APPLE_MONO_SYSTEM_FONT_STACK],
        ['.SF NS Mono Light', APPLE_MONO_SYSTEM_FONT_STACK],
        ['.SFNSRounded-Regular', APPLE_SANS_SYSTEM_FONT_STACK],
        ['.SF Hebrew Rounded', APPLE_SANS_SYSTEM_FONT_STACK],
        ['NewYorkSmall-Regular', APPLE_SERIF_SYSTEM_FONT_STACK],
    ])('classifies %s from internal metadata', (name, fallback) => {
        expect(
            classifyRestrictedAppleFont({
                metadataNames: [name],
                filename: 'renamed-brand-font.woff2',
            }),
        ).toEqual(expect.objectContaining({ evidence: 'metadata', fallback }));
    });

    it.each([
        ['New York Streets', 'NewYorkStreets-Regular'],
        ['San Francisco Nights', 'SanFranciscoNights-Regular'],
    ])('allows the unrelated family %s', (familyName, postscriptName) => {
        expect(
            classifyRestrictedAppleFont({
                metadataNames: [familyName, postscriptName],
                filename: 'ordinary-font.ttf',
            }),
        ).toBeNull();
    });

    it('does not let a renamed file hide restricted internal metadata', async () => {
        const result = await inspectAppleFont({
            body: makeTestTrueTypeFont({
                familyName: 'SF Pro',
                fullName: 'SF Pro Regular',
                postscriptName: 'SFPro-Regular',
            }),
            filename: 'acme-sans.ttf',
        });

        expect(result).toEqual({
            status: 'restricted',
            match: expect.objectContaining({
                family: 'San Francisco',
                evidence: 'metadata',
            }),
        });
    });

    it.each([
        ['TTF', makeTestTrueTypeFont],
        ['WOFF', makeTestWoffFont],
        ['WOFF2', makeTestWoff2Font],
    ])(
        'reads restricted metadata from a %s name table',
        async (_, makeFont) => {
            await expect(
                inspectAppleFont({
                    body: makeFont({
                        familyName: 'New York',
                        fullName: 'New York Medium',
                        postscriptName: 'NewYork-Medium',
                    }),
                    filename: 'renamed-brand-font.bin',
                }),
            ).resolves.toEqual({
                status: 'restricted',
                match: expect.objectContaining({ evidence: 'metadata' }),
            });
        },
    );

    it('allows an ordinary web font even when its filename looks restricted', async () => {
        const result = await inspectAppleFont({
            body: makeTestTrueTypeFont({
                familyName: 'Inter',
                fullName: 'Inter Regular',
                postscriptName: 'Inter-Regular',
            }),
            filename: 'SFPro-Regular.ttf',
        });

        expect(result).toEqual({ status: 'allowed' });
    });

    it('uses the filename only when internal metadata is unreadable', async () => {
        await expect(
            inspectAppleFont({
                body: Buffer.from([0x00, 0x01, 0x00, 0x00]),
                filename: 'SF-Pro-Display.woff2',
            }),
        ).resolves.toEqual({
            status: 'restricted',
            match: expect.objectContaining({ evidence: 'filename' }),
        });
    });

    it('does not decompress WOFF2 data beyond the inspection cap', async () => {
        await expect(
            inspectAppleFont({
                body: makeOversizedTestWoff2Font(),
                filename: 'ordinary-font.woff2',
            }),
        ).resolves.toEqual({ status: 'unreadable' });
    });
});
