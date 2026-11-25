import {
    AI_THREAD_IMAGE_MAX_BYTES,
    AI_THREAD_IMAGE_MAX_DIMENSION,
} from '@lightdash/common';
import { type CaptureMark } from './types';

export const INK_COLOR = '#e03131';

export const composeImage = async ({
    frame,
    marks,
    index,
}: {
    frame: ImageBitmap;
    marks: CaptureMark[];
    index: number;
}): Promise<File> => {
    // A high-density screen gives a picture larger than an agent image may be.
    const fit = Math.min(
        1,
        AI_THREAD_IMAGE_MAX_DIMENSION / Math.max(frame.width, frame.height),
    );
    const width = Math.round(frame.width * fit);
    const height = Math.round(frame.height * fit);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not draw the capture');
    context.drawImage(frame, 0, 0, width, height);

    const lineWidth = Math.max(3, width / 400);
    context.strokeStyle = INK_COLOR;
    context.lineWidth = lineWidth;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    for (const mark of marks) {
        for (const stroke of mark.strokes) {
            context.beginPath();
            stroke.points.forEach((point, i) => {
                const x = point.x * width;
                const y = point.y * height;
                if (i === 0) context.moveTo(x, y);
                else context.lineTo(x, y);
            });
            context.stroke();
        }
    }

    for (const mark of marks) {
        if (mark.shape !== 'pick') continue;
        context.beginPath();
        context.roundRect(
            mark.box.x * width,
            mark.box.y * height,
            mark.box.width * width,
            mark.box.height * height,
            lineWidth * 2,
        );
        context.stroke();
    }

    const radius = Math.max(12, width / 90);
    context.font = `bold ${Math.round(radius * 1.2)}px sans-serif`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    for (const mark of marks) {
        // Keep the badge inside the image when a mark touches the edge.
        const x = Math.min(
            width - radius,
            Math.max(radius, mark.box.x * width),
        );
        const y = Math.min(
            height - radius,
            Math.max(radius, mark.box.y * height),
        );
        context.fillStyle = INK_COLOR;
        context.beginPath();
        context.arc(x, y, radius, 0, 2 * Math.PI);
        context.fill();
        context.fillStyle = '#ffffff';
        context.fillText(String(mark.number), x, y);
    }

    const encode = (type: string, quality?: number) =>
        new Promise<Blob | null>((resolve) =>
            canvas.toBlob(resolve, type, quality),
        );
    const png = await encode('image/png');
    if (!png) throw new Error('Could not save the capture');
    if (png.size <= AI_THREAD_IMAGE_MAX_BYTES) {
        return new File([png], `capture-${index + 1}.png`, {
            type: 'image/png',
        });
    }
    // A busy page can be too heavy as PNG; JPEG keeps the marks readable.
    for (const quality of [0.85, 0.7, 0.5]) {
        const jpeg = await encode('image/jpeg', quality);
        if (jpeg && jpeg.size <= AI_THREAD_IMAGE_MAX_BYTES) {
            return new File([jpeg], `capture-${index + 1}.jpg`, {
                type: 'image/jpeg',
            });
        }
    }
    throw new Error('The capture is too large to send');
};
