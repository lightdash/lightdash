import { ParameterError } from '@lightdash/common';
import sharp from 'sharp';
import { processAvatarImage } from './processAvatarImage';

const makeTestPng = (width: number, height: number) =>
    sharp({
        create: {
            width,
            height,
            channels: 3,
            background: { r: 200, g: 50, b: 100 },
        },
    })
        .png()
        .toBuffer();

describe('processAvatarImage', () => {
    it('center-crops and resizes to a 256px square webp', async () => {
        const input = await makeTestPng(600, 400);
        const { image, contentHash } = await processAvatarImage(input);
        const metadata = await sharp(image).metadata();
        expect(metadata.format).toBe('webp');
        expect(metadata.width).toBe(256);
        expect(metadata.height).toBe(256);
        expect(contentHash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('is deterministic: same input, same hash', async () => {
        const input = await makeTestPng(300, 300);
        const first = await processAvatarImage(input);
        const second = await processAvatarImage(input);
        expect(first.contentHash).toBe(second.contentHash);
    });

    it('rejects bytes that are not a decodable image', async () => {
        await expect(
            processAvatarImage(Buffer.from('not an image at all')),
        ).rejects.toThrow(ParameterError);
    });
});
