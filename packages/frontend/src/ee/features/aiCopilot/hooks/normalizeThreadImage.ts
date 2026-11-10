import {
    AI_THREAD_IMAGE_INPUT_MAX_BYTES,
    AI_THREAD_IMAGE_MAX_BYTES,
    AI_THREAD_IMAGE_MAX_DIMENSION,
    AI_THREAD_IMAGE_MAX_PIXELS,
    assertUnreachable,
    type AiThreadImageMediaType,
} from '@lightdash/common';

const malformed = () =>
    new Error(
        'The image could not be read. Re-save it as PNG, JPEG or WebP and try again.',
    );
const animated = () =>
    new Error(
        'Only still images can be attached. Export one frame as PNG, JPEG or WebP.',
    );

const readBytes = (blob: Blob) =>
    new Promise<Uint8Array>((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () =>
            reject(
                new Error(
                    'The image could not be read. Please select it again.',
                ),
            );
        reader.onload = () => {
            if (reader.result === null || typeof reader.result === 'string')
                reject(malformed());
            else resolve(new Uint8Array(reader.result));
        };
        reader.readAsArrayBuffer(blob);
    });

const fourCC = (bytes: Uint8Array, offset: number) =>
    String.fromCharCode(...bytes.subarray(offset, offset + 4));

const sniffMediaType = (bytes: Uint8Array): AiThreadImageMediaType | null => {
    if (
        [137, 80, 78, 71, 13, 10, 26, 10].every(
            (value, index) => bytes[index] === value,
        )
    )
        return 'image/png';
    if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255)
        return 'image/jpeg';
    if (fourCC(bytes, 0) === 'RIFF' && fourCC(bytes, 8) === 'WEBP')
        return 'image/webp';
    return null;
};

/** Image MIME hints include unsupported images so they receive an honest format error, never a text upload. */
export const isThreadImageFile = async (file: File) =>
    file.type.startsWith('image/') ||
    sniffMediaType(await readBytes(file.slice(0, 12))) !== null;

const checkPixels = ({ width, height }: { width: number; height: number }) => {
    if (
        !Number.isSafeInteger(width) ||
        !Number.isSafeInteger(height) ||
        width < 1 ||
        height < 1
    )
        throw malformed();
    if (width * height > AI_THREAD_IMAGE_MAX_PIXELS)
        throw new Error(
            'The image is larger than 40 megapixels. Export a smaller screenshot before attaching it.',
        );
    return { width, height };
};

const inspectHeader = (
    bytes: Uint8Array,
    mediaType: AiThreadImageMediaType,
) => {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    switch (mediaType) {
        case 'image/png': {
            if (
                bytes.length < 33 ||
                view.getUint32(8) !== 13 ||
                fourCC(bytes, 12) !== 'IHDR'
            )
                throw malformed();
            const dimensions = checkPixels({
                width: view.getUint32(16),
                height: view.getUint32(20),
            });
            for (let offset = 8; offset + 12 <= bytes.length; ) {
                const size = view.getUint32(offset);
                const end = offset + 12 + size;
                if (end > bytes.length) throw malformed();
                const type = fourCC(bytes, offset + 4);
                if (type === 'IHDR' && offset !== 8) throw malformed();
                if (type === 'acTL') {
                    if (size < 8) throw malformed();
                    if (view.getUint32(offset + 8) > 1) throw animated();
                }
                offset = end;
            }
            return dimensions;
        }
        case 'image/jpeg': {
            let offset = 2;
            while (offset < bytes.length) {
                if (bytes[offset] !== 255) throw malformed();
                while (bytes[offset] === 255) offset += 1;
                const marker = bytes[offset];
                if (marker === undefined) throw malformed();
                offset += 1;
                if (marker === 218 || marker === 217) throw malformed();
                const standalone =
                    marker === 1 ||
                    marker === 216 ||
                    (marker >= 208 && marker <= 215);
                if (!standalone) {
                    if (offset + 2 > bytes.length) throw malformed();
                    const size = view.getUint16(offset);
                    if (size < 2 || offset + size > bytes.length)
                        throw malformed();
                    if (
                        [
                            192, 193, 194, 195, 197, 198, 199, 201, 202, 203,
                            205, 206, 207,
                        ].includes(marker)
                    ) {
                        if (size < 8) throw malformed();
                        return checkPixels({
                            width: view.getUint16(offset + 5),
                            height: view.getUint16(offset + 3),
                        });
                    }
                    offset += size;
                }
            }
            throw malformed();
        }
        case 'image/webp': {
            if (
                bytes.length < 20 ||
                view.getUint32(4, true) + 8 !== bytes.length
            )
                throw malformed();
            let dimensions: { width: number; height: number } | undefined;
            const uint24 = (offset: number) =>
                view.getUint8(offset) +
                view.getUint8(offset + 1) * 256 +
                view.getUint8(offset + 2) * 65536;
            for (let offset = 12; offset + 8 <= bytes.length; ) {
                const type = fourCC(bytes, offset);
                const size = view.getUint32(offset + 4, true);
                const start = offset + 8;
                if (start + size + (size % 2) > bytes.length) throw malformed();
                if (type === 'ANIM' || type === 'ANMF') throw animated();
                if (type === 'VP8X') {
                    if (size < 10) throw malformed();
                    if (view.getUint8(start) & 2) throw animated();
                    dimensions = checkPixels({
                        width: uint24(start + 4) + 1,
                        height: uint24(start + 7) + 1,
                    });
                } else if (type === 'VP8 ') {
                    if (
                        size < 10 ||
                        bytes[start + 3] !== 157 ||
                        bytes[start + 4] !== 1 ||
                        bytes[start + 5] !== 42
                    )
                        throw malformed();
                    const frame = checkPixels({
                        width: view.getUint16(start + 6, true) & 16383,
                        height: view.getUint16(start + 8, true) & 16383,
                    });
                    dimensions ??= frame;
                } else if (type === 'VP8L') {
                    if (size < 5 || bytes[start] !== 47) throw malformed();
                    const bits = view.getUint32(start + 1, true);
                    const frame = checkPixels({
                        width: (bits & 16383) + 1,
                        height: ((bits >>> 14) & 16383) + 1,
                    });
                    dimensions ??= frame;
                }
                offset = start + size + (size % 2);
            }
            if (!dimensions) throw malformed();
            return dimensions;
        }
        default:
            return assertUnreachable(mediaType, 'Unknown image media type');
    }
};

export type ThreadImageCodec = {
    decode: (file: File) => Promise<ImageBitmap>;
    encode: (
        image: ImageBitmap,
        options: {
            width: number;
            height: number;
            mediaType: AiThreadImageMediaType;
        },
    ) => Promise<Blob>;
};

const browserCodec: ThreadImageCodec = {
    decode: (file) =>
        createImageBitmap(file, { imageOrientation: 'from-image' }),
    encode: (image, { width, height, mediaType }) =>
        new Promise<Blob>((resolve, reject) => {
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const context = canvas.getContext('2d');
            if (!context) {
                reject(
                    new Error(
                        'Image processing is not available in this browser. Try another browser.',
                    ),
                );
                return;
            }
            context.imageSmoothingEnabled = true;
            context.imageSmoothingQuality = 'high';
            context.drawImage(image, 0, 0, width, height);
            canvas.toBlob(
                (blob) => {
                    if (blob === null || blob.type !== mediaType)
                        reject(
                            new Error(
                                'This browser could not export the image. Re-save it as PNG or JPEG and try again.',
                            ),
                        );
                    else resolve(blob);
                },
                mediaType,
                mediaType === 'image/png' ? undefined : 0.92,
            );
        }),
};

/** Header bounds precede allocation; the oriented decoded bitmap determines proportional resizing. */
export const normalizeThreadImage = async (
    file: File,
    codec: ThreadImageCodec = browserCodec,
): Promise<File> => {
    if (file.size === 0 || file.size > AI_THREAD_IMAGE_INPUT_MAX_BYTES)
        throw new Error(
            'Choose an image up to 10 MiB. Export a smaller screenshot and try again.',
        );
    const bytes = await readBytes(file);
    const mediaType = sniffMediaType(bytes);
    if (mediaType === null)
        throw new Error(
            'Only PNG, JPEG and WebP images can be attached. Export the screenshot in one of these formats.',
        );
    inspectHeader(bytes, mediaType);
    const input =
        file.type === mediaType
            ? file
            : new File([file], file.name, {
                  type: mediaType,
                  lastModified: file.lastModified,
              });
    let image: ImageBitmap;
    try {
        image = await codec.decode(input);
    } catch {
        throw malformed();
    }
    try {
        const { width, height } = checkPixels(image);
        if (
            file.size <= AI_THREAD_IMAGE_MAX_BYTES &&
            Math.max(width, height) <= AI_THREAD_IMAGE_MAX_DIMENSION
        )
            return input;
        const ratio = Math.min(
            1,
            AI_THREAD_IMAGE_MAX_DIMENSION / Math.max(width, height),
        );
        const blob = await codec.encode(image, {
            width: Math.max(1, Math.round(width * ratio)),
            height: Math.max(1, Math.round(height * ratio)),
            mediaType,
        });
        if (blob.type !== mediaType)
            throw new Error(
                'The browser changed the image format. Re-save it as PNG or JPEG and try again.',
            );
        if (blob.size === 0 || blob.size > AI_THREAD_IMAGE_MAX_BYTES)
            throw new Error(
                'The image is still larger than 3 MiB after re-encoding. Export it as JPEG or crop it yourself while keeping chart labels readable.',
            );
        return new File([blob], file.name, {
            type: mediaType,
            lastModified: file.lastModified,
        });
    } finally {
        image.close();
    }
};
