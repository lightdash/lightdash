import { getErrorMessage } from '@lightdash/common';

export const copyImageToClipboard = async (
    base64Image: string,
): Promise<void> => {
    try {
        // Create a temporary canvas to convert base64 to blob
        const img = new Image();
        img.src = base64Image;

        await new Promise((resolve) => {
            img.onload = resolve;
        });

        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;

        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Could not get canvas context');

        ctx.drawImage(img, 0, 0);

        // Convert canvas to blob
        const blob = await new Promise<Blob>((resolve) => {
            canvas.toBlob((b) => {
                if (b) resolve(b);
            }, 'image/png');
        });

        // Create ClipboardItem and write to clipboard
        const item = new ClipboardItem({ 'image/png': blob });
        await navigator.clipboard.write([item]);
    } catch (error) {
        console.error(
            `Failed to copy image to clipboard: ${getErrorMessage(error)}`,
        );
        throw error;
    }
};
