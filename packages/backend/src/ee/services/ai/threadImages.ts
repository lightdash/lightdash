import {
    AI_THREAD_IMAGE_MAX_BYTES,
    AI_THREAD_IMAGE_MAX_DIMENSION,
    ParameterError,
    type AiThreadImageMediaType,
} from '@lightdash/common';
import sharp from 'sharp';

/** Fully decode before trusting an image, retaining screenshot detail. */
export const normalizeThreadImage = async (bytes: Buffer) => {
    if (bytes.length === 0 || bytes.length > AI_THREAD_IMAGE_MAX_BYTES) {
        throw new ParameterError(
            'Images must be nonempty and no larger than 3 MiB.',
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
        let normalized = bytes;
        if (format === 'png') {
            normalized = await decoder.clone().rotate().png().toBuffer();
        } else if (
            metadata.exif ||
            metadata.xmp ||
            (metadata.orientation ?? 1) !== 1
        ) {
            normalized = await decoder
                .clone()
                .rotate()
                .toFormat(format, { quality: 92 })
                .toBuffer();
        }
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
