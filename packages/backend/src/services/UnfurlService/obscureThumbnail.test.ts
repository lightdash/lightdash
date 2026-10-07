import sharp from 'sharp';
import { obscureThumbnailImage } from './obscureThumbnail';

const WIDTH = 120;
const HEIGHT = 80;

const rawPixels = async (png: Buffer) =>
    (await sharp(png).raw().toBuffer({ resolveWithObject: true })).data;

// Black and white vertical stripes: any blur changes them.
const stripedPng = () => {
    const pixels = Buffer.alloc(WIDTH * HEIGHT * 3);
    for (let i = 0; i < WIDTH * HEIGHT; i += 1) {
        pixels.fill(
            Math.floor((i % WIDTH) / 4) % 2 ? 255 : 0,
            i * 3,
            i * 3 + 3,
        );
    }
    return sharp(pixels, { raw: { width: WIDTH, height: HEIGHT, channels: 3 } })
        .png()
        .toBuffer();
};

describe('obscureThumbnailImage', () => {
    it('blurs the image and keeps its dimensions', async () => {
        const input = await stripedPng();

        const output = await obscureThumbnailImage(input);

        const meta = await sharp(output).metadata();
        expect(meta.format).toBe('png');
        expect({ width: meta.width, height: meta.height }).toEqual({
            width: WIDTH,
            height: HEIGHT,
        });
        expect((await rawPixels(output)).equals(await rawPixels(input))).toBe(
            false,
        );
    });

    it('leaves a solid colour image unchanged', async () => {
        const input = await sharp({
            create: {
                width: WIDTH,
                height: HEIGHT,
                channels: 3,
                background: { r: 30, g: 120, b: 200 },
            },
        })
            .png()
            .toBuffer();

        const output = await obscureThumbnailImage(input);

        expect((await rawPixels(output)).equals(await rawPixels(input))).toBe(
            true,
        );
    });
});
