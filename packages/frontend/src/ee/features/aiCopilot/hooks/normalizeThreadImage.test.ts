import {
    AI_THREAD_IMAGE_INPUT_MAX_BYTES,
    AI_THREAD_IMAGE_MAX_BYTES,
    assertUnreachable,
    type AiThreadImageMediaType,
} from '@lightdash/common';
import {
    isThreadImageFile,
    normalizeThreadImage,
} from './normalizeThreadImage';

const tag = (bytes: Uint8Array, offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1)
        bytes[offset + index] = value.charCodeAt(index);
};
const png = (width: number, height: number, extra = 0, frames = 1) => {
    const bytes = new Uint8Array(
        33 + (extra > 0 ? extra + 12 : 0) + (frames > 1 ? 20 : 0),
    );
    bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
    const view = new DataView(bytes.buffer);
    view.setUint32(8, 13);
    tag(bytes, 12, 'IHDR');
    view.setUint32(16, width);
    view.setUint32(20, height);
    if (extra > 0) {
        view.setUint32(33, extra);
        tag(bytes, 37, 'tEXt');
    }
    if (frames > 1) {
        const offset = 33 + (extra > 0 ? extra + 12 : 0);
        view.setUint32(offset, 8);
        tag(bytes, offset + 4, 'acTL');
        view.setUint32(offset + 8, frames);
    }
    return new File([bytes], 'chart.png', { type: 'image/png' });
};
const jpeg = (width: number, height: number, marker = 192) =>
    new File(
        [
            new Uint8Array([
                255,
                216,
                255,
                225,
                0,
                4,
                0,
                0,
                255,
                marker,
                0,
                8,
                8,
                height >>> 8,
                height & 255,
                width >>> 8,
                width & 255,
                1,
                255,
                217,
            ]),
        ],
        'chart.jpg',
        { type: 'image/jpeg' },
    );
const webp = (
    width: number,
    height: number,
    format: 'VP8 ' | 'VP8L' | 'VP8X',
    animation = false,
) => {
    const size = format === 'VP8L' ? 5 : 10;
    const bytes = new Uint8Array(20 + size + (size % 2));
    const view = new DataView(bytes.buffer);
    tag(bytes, 0, 'RIFF');
    view.setUint32(4, bytes.length - 8, true);
    tag(bytes, 8, 'WEBP');
    tag(bytes, 12, format);
    view.setUint32(16, size, true);
    switch (format) {
        case 'VP8 ':
            bytes.set([157, 1, 42], 23);
            view.setUint16(26, width, true);
            view.setUint16(28, height, true);
            break;
        case 'VP8L':
            bytes[20] = 47;
            view.setUint32(21, (width - 1) | ((height - 1) << 14), true);
            break;
        case 'VP8X': {
            bytes[20] = animation ? 2 : 0;
            for (let index = 0; index < 3; index += 1) {
                bytes[24 + index] = ((width - 1) >>> (8 * index)) & 255;
                bytes[27 + index] = ((height - 1) >>> (8 * index)) & 255;
            }
            break;
        }
        default:
            assertUnreachable(format, 'Unknown WebP fixture');
    }
    return new File([bytes], 'chart.webp', { type: 'image/webp' });
};
const setup = (
    width: number,
    height: number,
    outputType: AiThreadImageMediaType = 'image/png',
    outputSize = 100,
) => {
    const bitmap: ImageBitmap = { width, height, close: vi.fn() };
    const decode = vi.fn(async () => bitmap);
    const encode = vi.fn(
        async () =>
            new Blob([new Uint8Array(outputSize)], { type: outputType }),
    );
    return { bitmap, decode, encode };
};

test('small original PNG bytes are untouched and the decoded bitmap is always closed', async () => {
    const file = png(1200, 600);
    const codec = setup(1200, 600);
    expect(await normalizeThreadImage(file, codec)).toBe(file);
    expect(codec.encode).not.toHaveBeenCalled();
    expect(codec.bitmap.close).toHaveBeenCalledOnce();
});

test('magic bytes, not filename or declared MIME, identify dropped screenshots', async () => {
    expect(
        await isThreadImageFile(
            new File([png(2, 2)], 'notes.txt', { type: 'text/plain' }),
        ),
    ).toBe(true);
    expect(
        await isThreadImageFile(
            new File(['plain text'], 'photo.png', { type: 'text/plain' }),
        ),
    ).toBe(false);
    expect(
        await isThreadImageFile(
            new File(['<svg/>'], 'drawing.svg', { type: 'image/svg+xml' }),
        ),
    ).toBe(true);
});

test('incorrect MIME hints are corrected without re-encoding original bytes', async () => {
    const file = new File([png(2, 2)], 'misnamed.txt', { type: 'text/plain' });
    const codec = setup(2, 2);
    const normalized = await normalizeThreadImage(file, codec);
    expect(normalized.type).toBe('image/png');
    expect(normalized.size).toBe(file.size);
    expect(codec.encode).not.toHaveBeenCalled();
});

test.each([192, 193, 194])(
    'JPEG frame marker %i is inspected without decoding its EXIF metadata',
    async (marker) => {
        const file = jpeg(1200, 600, marker);
        const codec = setup(1200, 600, 'image/jpeg');
        expect(await normalizeThreadImage(file, codec)).toBe(file);
        expect(codec.encode).not.toHaveBeenCalled();
    },
);

test.each(['VP8 ', 'VP8L', 'VP8X'] as const)(
    'WebP %s dimensions are read before decoding',
    async (format) => {
        const file = webp(1200, 600, format);
        expect(
            await normalizeThreadImage(file, setup(1200, 600, 'image/webp')),
        ).toBe(file);
        const codec = setup(9000, 9000, 'image/webp');
        await expect(
            normalizeThreadImage(webp(9000, 9000, format), codec),
        ).rejects.toThrow('40 megapixels');
        expect(codec.decode).not.toHaveBeenCalled();
    },
);

test('over-40-megapixel PNG/JPEG headers are rejected before bitmap allocation', async () => {
    const codec = setup(10000, 10000);
    await expect(
        normalizeThreadImage(png(10000, 10000), codec),
    ).rejects.toThrow('40 megapixels');
    await expect(
        normalizeThreadImage(jpeg(10000, 10000), codec),
    ).rejects.toThrow('40 megapixels');
    expect(codec.decode).not.toHaveBeenCalled();
});

test('the post-decode pixel check catches a dishonest or inconsistent header', async () => {
    const codec = setup(10000, 10000);
    await expect(normalizeThreadImage(png(2, 2), codec)).rejects.toThrow(
        '40 megapixels',
    );
    expect(codec.encode).not.toHaveBeenCalled();
    expect(codec.bitmap.close).toHaveBeenCalledOnce();
});

test('oriented decoded dimensions, not the raw JPEG header, drive proportional downscaling', async () => {
    const codec = setup(2000, 4000, 'image/jpeg');
    const result = await normalizeThreadImage(jpeg(4000, 2000), codec);
    expect(codec.encode).toHaveBeenCalledExactlyOnceWith(codec.bitmap, {
        width: 1280,
        height: 2560,
        mediaType: 'image/jpeg',
    });
    expect(result.type).toBe('image/jpeg');
    expect(codec.bitmap.close).toHaveBeenCalledOnce();
});

test('a byte-heavy small PNG is encoded once without upscaling, crop or format fallback', async () => {
    const codec = setup(1200, 600);
    await normalizeThreadImage(
        png(1200, 600, AI_THREAD_IMAGE_MAX_BYTES),
        codec,
    );
    expect(codec.encode).toHaveBeenCalledExactlyOnceWith(codec.bitmap, {
        width: 1200,
        height: 600,
        mediaType: 'image/png',
    });
});

test('a palette PNG that grows past the cap is rejected with an actionable message, not a lossy ladder', async () => {
    const codec = setup(4000, 2000, 'image/png', AI_THREAD_IMAGE_MAX_BYTES + 1);
    await expect(normalizeThreadImage(png(4000, 2000), codec)).rejects.toThrow(
        'Export it as JPEG or crop it yourself',
    );
    expect(codec.encode).toHaveBeenCalledOnce();
    expect(codec.bitmap.close).toHaveBeenCalledOnce();
});

test('browser format substitution is not silently accepted', async () => {
    const codec = setup(4000, 2000, 'image/jpeg');
    await expect(normalizeThreadImage(png(4000, 2000), codec)).rejects.toThrow(
        'changed the image format',
    );
    expect(codec.bitmap.close).toHaveBeenCalledOnce();
});

test('animation, unsupported formats and truncated headers are rejected before decoding', async () => {
    const codec = setup(2, 2);
    await expect(normalizeThreadImage(png(2, 2, 0, 2), codec)).rejects.toThrow(
        'Only still images',
    );
    await expect(
        normalizeThreadImage(webp(2, 2, 'VP8X', true), codec),
    ).rejects.toThrow('Only still images');
    await expect(
        normalizeThreadImage(
            new File(['<svg/>'], 'fake.png', { type: 'image/png' }),
            codec,
        ),
    ).rejects.toThrow('Only PNG, JPEG and WebP');
    await expect(
        normalizeThreadImage(
            new File([jpeg(2, 2).slice(0, 12)], 'truncated.jpg'),
            codec,
        ),
    ).rejects.toThrow('Re-save');
    expect(codec.decode).not.toHaveBeenCalled();
});

test('empty and oversized originals never enter the decoder', async () => {
    const codec = setup(2, 2);
    await expect(
        normalizeThreadImage(new File([], 'empty.png'), codec),
    ).rejects.toThrow('10 MiB');
    await expect(
        normalizeThreadImage(
            new File(
                [new Uint8Array(AI_THREAD_IMAGE_INPUT_MAX_BYTES + 1)],
                'large.png',
            ),
            codec,
        ),
    ).rejects.toThrow('10 MiB');
    expect(codec.decode).not.toHaveBeenCalled();
});

test('decode and encode failures are actionable and release decoded resources', async () => {
    const codec = setup(4000, 2000);
    codec.decode.mockRejectedValueOnce(new Error('decoder failure'));
    await expect(normalizeThreadImage(png(4000, 2000), codec)).rejects.toThrow(
        'Re-save',
    );
    codec.encode.mockRejectedValueOnce(new Error('encoder failure'));
    await expect(normalizeThreadImage(png(4000, 2000), codec)).rejects.toThrow(
        'encoder failure',
    );
    expect(codec.bitmap.close).toHaveBeenCalledOnce();
});
