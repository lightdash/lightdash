import type { Frame } from 'playwright';
import sharp from 'sharp';

// Tuning knobs for obscured data app thumbnails.
export const TEXT_SHADOW_RADIUS_EM = 0.6;
export const SVG_TEXT_BLUR_EM = 0.35;
export const CANVAS_BLUR_PX = 4;
export const IMAGE_BLUR_SIGMA_PER_WIDTH = 0.006;
export const MIN_IMAGE_BLUR_SIGMA = 0.3;

// Transparent fill keeps `color`, so the shadow takes each element's colour and scales with its font size.
export const OBSCURE_TEXT_CSS = [
    `* { -webkit-text-fill-color: transparent !important; text-shadow: 0 0 ${TEXT_SHADOW_RADIUS_EM}em currentColor !important; }`,
    `svg text { filter: blur(${SVG_TEXT_BLUR_EM}em) !important; }`,
    `canvas { filter: blur(${CANVAS_BLUR_PX}px) !important; }`,
].join('\n');

const TRANSPARENT_FILL = 'rgba(0, 0, 0, 0)';

/** Injects the obscuring stylesheet into every frame; throws unless each frame confirms it applied. */
export const obscureFramesText = async (
    frames: Pick<Frame, 'addStyleTag' | 'evaluate'>[],
): Promise<void> => {
    await Promise.all(
        frames.map(async (frame) => {
            await frame.addStyleTag({ content: OBSCURE_TEXT_CSS });
            const fill = await frame.evaluate(() =>
                getComputedStyle(document.body).getPropertyValue(
                    '-webkit-text-fill-color',
                ),
            );
            if (fill !== TRANSPARENT_FILL) {
                throw new Error(
                    `Could not obscure thumbnail text: frame text fill is ${fill}`,
                );
            }
        }),
    );
};

/** Gaussian blur proportional to image width, so canvas-drawn labels and residual edges soften. */
export const obscureThumbnailImage = async (png: Buffer): Promise<Buffer> => {
    const { width } = await sharp(png).metadata();
    if (!width) throw new Error('Could not read thumbnail width');
    const sigma = Math.max(
        MIN_IMAGE_BLUR_SIGMA,
        width * IMAGE_BLUR_SIGMA_PER_WIDTH,
    );
    return sharp(png).blur(sigma).png().toBuffer();
};
