import { ParameterError } from '@lightdash/common';
import { createHash } from 'crypto';
import sharp from 'sharp';

export const AVATAR_SIZE_PX = 256;

export const processAvatarImage = async (
    input: Buffer,
): Promise<{ image: Buffer; contentHash: string }> => {
    let image: Buffer;
    try {
        // pages:1 flattens animated inputs to their first frame.
        image = await sharp(input, { pages: 1 })
            .rotate()
            .resize(AVATAR_SIZE_PX, AVATAR_SIZE_PX, { fit: 'cover' })
            .webp({ quality: 80 })
            .toBuffer();
    } catch (e) {
        throw new ParameterError('Not a valid image');
    }
    const contentHash = createHash('sha256').update(image).digest('hex');
    return { image, contentHash };
};
