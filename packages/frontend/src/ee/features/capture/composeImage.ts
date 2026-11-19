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
    const canvas = document.createElement('canvas');
    canvas.width = frame.width;
    canvas.height = frame.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not draw the capture');
    context.drawImage(frame, 0, 0);

    const lineWidth = Math.max(3, frame.width / 400);
    context.strokeStyle = INK_COLOR;
    context.lineWidth = lineWidth;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    for (const mark of marks) {
        for (const stroke of mark.strokes) {
            context.beginPath();
            stroke.points.forEach((point, i) => {
                const x = point.x * frame.width;
                const y = point.y * frame.height;
                if (i === 0) context.moveTo(x, y);
                else context.lineTo(x, y);
            });
            context.stroke();
        }
    }

    const radius = Math.max(12, frame.width / 90);
    context.font = `bold ${Math.round(radius * 1.2)}px sans-serif`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    for (const mark of marks) {
        // Keep the badge inside the image when a mark touches the edge.
        const x = Math.min(
            frame.width - radius,
            Math.max(radius, mark.box.x * frame.width),
        );
        const y = Math.min(
            frame.height - radius,
            Math.max(radius, mark.box.y * frame.height),
        );
        context.fillStyle = INK_COLOR;
        context.beginPath();
        context.arc(x, y, radius, 0, 2 * Math.PI);
        context.fill();
        context.fillStyle = '#ffffff';
        context.fillText(String(mark.number), x, y);
    }

    const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/png'),
    );
    if (!blob) throw new Error('Could not save the capture');
    return new File([blob], `capture-${index + 1}.png`, { type: 'image/png' });
};
