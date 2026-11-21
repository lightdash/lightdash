/** A picture of the surface, with a small grey thumbnail to compare screens by. */
export type TabFrame = { bitmap: ImageBitmap; thumb: Uint8ClampedArray };

const THUMB_SIZE = 64;

export const toThumb = (bitmap: ImageBitmap): Uint8ClampedArray => {
    const canvas = document.createElement('canvas');
    canvas.width = THUMB_SIZE;
    canvas.height = THUMB_SIZE;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return new Uint8ClampedArray(0);
    context.drawImage(bitmap, 0, 0, THUMB_SIZE, THUMB_SIZE);
    const { data } = context.getImageData(0, 0, THUMB_SIZE, THUMB_SIZE);
    const grey = new Uint8ClampedArray(THUMB_SIZE * THUMB_SIZE);
    for (let i = 0; i < grey.length; i += 1) {
        grey[i] = (data[i * 4] + data[i * 4 + 1] + data[i * 4 + 2]) / 3;
    }
    return grey;
};
