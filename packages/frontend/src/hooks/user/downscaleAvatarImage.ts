// Center-crop to square + downscale in-browser so uploads are ~50KB, not raw photos.
export const downscaleAvatarImage = (
    file: File,
    maxSize: number = 512,
): Promise<Blob> =>
    new Promise((resolve, reject) => {
        const img = new Image();
        const objectUrl = URL.createObjectURL(file);
        img.onload = () => {
            URL.revokeObjectURL(objectUrl);
            const side = Math.min(img.width, img.height);
            const target = Math.min(maxSize, side);
            const canvas = document.createElement('canvas');
            canvas.width = target;
            canvas.height = target;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                reject(new Error('Could not process image in this browser'));
                return;
            }
            ctx.drawImage(
                img,
                (img.width - side) / 2,
                (img.height - side) / 2,
                side,
                side,
                0,
                0,
                target,
                target,
            );
            canvas.toBlob(
                (blob) =>
                    blob
                        ? resolve(blob)
                        : reject(new Error('Could not encode image')),
                'image/webp',
                0.9,
            );
        };
        img.onerror = () => {
            URL.revokeObjectURL(objectUrl);
            reject(new Error('File is not a valid image'));
        };
        img.src = objectUrl;
    });
