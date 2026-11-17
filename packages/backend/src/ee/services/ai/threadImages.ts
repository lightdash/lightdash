import {
    AI_THREAD_IMAGE_MAX_BYTES,
    AI_THREAD_IMAGE_MAX_DIMENSION,
    assertUnreachable,
    ParameterError,
    sniffThreadImageMediaType,
    type AiThreadImageMediaType,
} from '@lightdash/common';
import sharp, { type Sharp } from 'sharp';

const LOSSY_QUALITIES = [92, 85, 75];

const isLosslessWebp = (bytes: Buffer): boolean => {
    // RIFF chunks start after the 12-byte header: 4-byte type, 4-byte size.
    for (let offset = 12; offset + 8 <= bytes.length; ) {
        if (bytes.toString('latin1', offset, offset + 4) === 'VP8L')
            return true;
        const size = bytes.readUInt32LE(offset + 4);
        offset += 8 + size + (size % 2);
    }
    return false;
};

/** The first encoding that fits; a re-encode can be larger than its source. */
const firstWithinLimit = async (
    encodings: (() => Promise<Buffer>)[],
): Promise<Buffer> => {
    let smallest: Buffer | null = null;
    for (const encode of encodings) {
        // eslint-disable-next-line no-await-in-loop -- Later encodings only run when the earlier one is too large.
        const encoded = await encode();
        if (encoded.length <= AI_THREAD_IMAGE_MAX_BYTES) return encoded;
        if (smallest === null || encoded.length < smallest.length)
            smallest = encoded;
    }
    if (smallest === null) throw new Error('No image encoding was attempted');
    return smallest;
};

const reencode = (
    upright: Sharp,
    source: {
        format: 'png' | 'jpeg' | 'webp';
        isPalette: boolean;
        bytes: Buffer;
    },
): Promise<Buffer> => {
    switch (source.format) {
        case 'png':
            // Sharp's defaults can double a photographic or indexed PNG.
            return upright
                .clone()
                .png(
                    source.isPalette
                        ? { palette: true }
                        : { adaptiveFiltering: true, compressionLevel: 9 },
                )
                .toBuffer();
        case 'jpeg':
            return firstWithinLimit(
                LOSSY_QUALITIES.map(
                    (quality) => () =>
                        upright.clone().jpeg({ quality }).toBuffer(),
                ),
            );
        case 'webp':
            return firstWithinLimit([
                ...(isLosslessWebp(source.bytes)
                    ? [
                          () =>
                              upright
                                  .clone()
                                  .webp({ lossless: true })
                                  .toBuffer(),
                      ]
                    : []),
                ...LOSSY_QUALITIES.map(
                    (quality) => () =>
                        upright.clone().webp({ quality }).toBuffer(),
                ),
            ]);
        default:
            return assertUnreachable(source.format, 'Unknown image format');
    }
};

/**
 * Fully decode before trusting an image, then always re-encode it in its own
 * format: that drops every metadata block and any bytes appended to the file.
 */
export const normalizeThreadImage = async (bytes: Buffer) => {
    if (bytes.length === 0 || bytes.length > AI_THREAD_IMAGE_MAX_BYTES) {
        throw new ParameterError(
            'Images must be nonempty and no larger than 3 MiB.',
        );
    }
    // Checked before the decoder sees the bytes, so only these three readers run.
    const sniffed = sniffThreadImageMediaType(bytes);
    if (sniffed === null) {
        throw new ParameterError(
            'Only PNG, JPEG and WebP images can be attached.',
        );
    }
    try {
        const decoder = sharp(bytes, {
            limitInputPixels: AI_THREAD_IMAGE_MAX_DIMENSION ** 2,
            failOn: 'warning',
        });
        const metadata = await decoder.metadata();
        const { format, width, height, pages } = metadata;
        if (format !== 'png' && format !== 'jpeg' && format !== 'webp') {
            throw new ParameterError(
                'Only PNG, JPEG and WebP images can be attached.',
            );
        }
        if ((pages ?? 1) !== 1) {
            throw new ParameterError('Animated images cannot be attached.');
        }
        if (
            !width ||
            !height ||
            width > AI_THREAD_IMAGE_MAX_DIMENSION ||
            height > AI_THREAD_IMAGE_MAX_DIMENSION
        ) {
            throw new ParameterError(
                'Resize the image to a longest edge of 2560 pixels before uploading.',
            );
        }
        if (
            format === 'jpeg' &&
            (bytes.at(-2) !== 0xff || bytes.at(-1) !== 0xd9)
        ) {
            throw new ParameterError(
                'The JPEG image is incomplete or contains trailing data.',
            );
        }
        if (
            format === 'webp' &&
            (bytes.length < 12 || bytes.readUInt32LE(4) + 8 !== bytes.length)
        ) {
            throw new ParameterError(
                'The WebP image is incomplete or contains trailing data.',
            );
        }
        await decoder.clone().raw().toBuffer();
        const normalized = await reencode(decoder.clone().rotate(), {
            format,
            isPalette: metadata.isPalette === true,
            bytes,
        });
        if (normalized.length > AI_THREAD_IMAGE_MAX_BYTES) {
            throw new ParameterError(
                'The processed image exceeds 3 MiB. Attach a smaller image.',
            );
        }
        const finalMetadata = await sharp(normalized).metadata();
        if (!finalMetadata.width || !finalMetadata.height) {
            throw new ParameterError('The image dimensions could not be read.');
        }
        const mediaTypes = {
            png: 'image/png',
            jpeg: 'image/jpeg',
            webp: 'image/webp',
        } satisfies Record<typeof format, AiThreadImageMediaType>;
        if (mediaTypes[format] !== sniffed) {
            throw new ParameterError(
                'The image content does not match its format.',
            );
        }
        return {
            bytes: normalized,
            mediaType: mediaTypes[format],
            width: finalMetadata.width,
            height: finalMetadata.height,
        };
    } catch (error) {
        if (error instanceof ParameterError) throw error;
        throw new ParameterError(
            'The image could not be decoded. Attach a valid PNG, JPEG or WebP image within the size and dimension limits.',
        );
    }
};
