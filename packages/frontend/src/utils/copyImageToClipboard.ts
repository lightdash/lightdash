export const copyImageToClipboard = async (
    base64Image: string,
): Promise<void> => {
    try {
        // Create a temporary canvas to convert base64 to blob
        const img = new Image();
        await new Promise<void>((resolve, reject) => {
            img.onload = () => {
                resolve();
            };
            img.onerror = () => {
                reject(new Error('Unable to load rasterized chart image'));
            };
            img.src = base64Image;
        });

        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;

        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Could not get canvas context');

        ctx.drawImage(img, 0, 0);

        // Convert canvas to blob
        const blob = await new Promise<Blob>((resolve, reject) => {
            canvas.toBlob((b) => {
                if (b) {
                    resolve(b);
                    return;
                }
                reject(new Error('Unable to convert chart image to blob'));
            }, 'image/png');
        });

        // Create ClipboardItem and write to clipboard
        const item = new ClipboardItem({ 'image/png': blob });
        await navigator.clipboard.write([item]);
    } catch (error) {
        console.error('Failed to copy image to clipboard', error);
        throw error;
    }
};
