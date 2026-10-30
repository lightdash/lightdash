import { AI_THREAD_IMAGE_MAX_BYTES, ParameterError } from '@lightdash/common';
import sharp from 'sharp';
import { normalizeThreadImage } from './threadImages';

const screenshot = () =>
    sharp({
        create: {
            width: 64,
            height: 32,
            channels: 4,
            background: { r: 50, g: 100, b: 150, alpha: 0.5 },
        },
    });

test('PNG normalization strips metadata without changing pixels or transparency', async () => {
    const input = await screenshot().withMetadata().png().toBuffer();
    const normalized = await normalizeThreadImage(input);
    expect(normalized).toMatchObject({
        mediaType: 'image/png',
        width: 64,
        height: 32,
    });
    expect((await sharp(normalized.bytes).metadata()).exif).toBeUndefined();
    expect(await sharp(normalized.bytes).raw().toBuffer()).toEqual(
        await sharp(input).raw().toBuffer(),
    );
});

test.each(['jpeg', 'webp'] as const)(
    'valid %s without metadata is not recompressed',
    async (format) => {
        const input = await screenshot().toFormat(format).toBuffer();
        expect((await normalizeThreadImage(input)).bytes).toBe(input);
    },
);

test('orientation is applied before metadata is stripped', async () => {
    const input = await screenshot()
        .withMetadata({ orientation: 6 })
        .jpeg()
        .toBuffer();
    const normalized = await normalizeThreadImage(input);
    expect(normalized).toMatchObject({
        width: 32,
        height: 64,
        mediaType: 'image/jpeg',
    });
    expect(
        (await sharp(normalized.bytes).metadata()).orientation,
    ).toBeUndefined();
});

test('empty and over-budget inputs are rejected before decoding', async () => {
    await expect(normalizeThreadImage(Buffer.alloc(0))).rejects.toBeInstanceOf(
        ParameterError,
    );
    await expect(
        normalizeThreadImage(Buffer.alloc(AI_THREAD_IMAGE_MAX_BYTES + 1)),
    ).rejects.toBeInstanceOf(ParameterError);
});

test('valid images over the dimension cap are rejected', async () => {
    const input = await sharp({
        create: { width: 2561, height: 1, channels: 3, background: 'red' },
    })
        .png()
        .toBuffer();
    await expect(normalizeThreadImage(input)).rejects.toThrow('2560');
});

test('a valid header is insufficient when the image pixels are truncated', async () => {
    const input = await screenshot().png().toBuffer();
    const truncated = input.subarray(0, input.length - 20);
    expect((await sharp(truncated).metadata()).format).toBe('png');
    await expect(normalizeThreadImage(truncated)).rejects.toBeInstanceOf(
        ParameterError,
    );
});

test('unsupported formats and spoofed image data are rejected', async () => {
    await expect(
        normalizeThreadImage(
            Buffer.from(
                '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>',
            ),
        ),
    ).rejects.toThrow('Only PNG');
    await expect(
        normalizeThreadImage(Buffer.from('this is not a PNG')),
    ).rejects.toBeInstanceOf(ParameterError);
});

test('animated WebP is rejected instead of silently flattening the first frame', async () => {
    const input = await sharp(
        Buffer.from([255, 0, 0, 255, 0, 0, 0, 0, 255, 0, 0, 255]),
        { raw: { width: 2, height: 2, channels: 3, pageHeight: 1 } },
    )
        .webp({ loop: 0, delay: [100, 100] })
        .toBuffer();
    expect((await sharp(input).metadata()).pages).toBe(2);
    await expect(normalizeThreadImage(input)).rejects.toThrow('Animated');
});

test.each(['jpeg', 'webp'] as const)(
    'trailing bytes are refused for preserved %s input',
    async (format) => {
        const input = Buffer.concat([
            await screenshot().toFormat(format).toBuffer(),
            Buffer.from('trailing data'),
        ]);
        await expect(normalizeThreadImage(input)).rejects.toBeInstanceOf(
            ParameterError,
        );
    },
);
