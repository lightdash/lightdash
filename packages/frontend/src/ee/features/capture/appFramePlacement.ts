type Rect = { x: number; y: number; width: number; height: number };

/**
 * Where a frame's own picture goes in a picture of the page, and the part of
 * it to use. The frame pictures its whole document from the top, so only the
 * part its window shows is taken. Null when the frame is outside the picture.
 */
export const appFramePlacement = ({
    frame,
    page,
    scale,
    picture,
}: {
    /** The frame on the page, in page pixels. */
    frame: Rect;
    /** The part of the page pictured, in page pixels. */
    page: Rect;
    /** Picture pixels per page pixel. */
    scale: number;
    /** The size of the frame's own picture. */
    picture: { width: number; height: number };
}): { source: Rect; target: Rect } | null => {
    if (frame.width <= 0 || frame.height <= 0 || picture.width <= 0) {
        return null;
    }
    const outside =
        frame.x >= page.x + page.width ||
        frame.y >= page.y + page.height ||
        frame.x + frame.width <= page.x ||
        frame.y + frame.height <= page.y;
    if (outside) return null;
    // The picture is as wide as the frame's window; its height may run on.
    const shown = Math.min(
        picture.height,
        (picture.width * frame.height) / frame.width,
    );
    return {
        source: { x: 0, y: 0, width: picture.width, height: shown },
        target: {
            x: (frame.x - page.x) * scale,
            y: (frame.y - page.y) * scale,
            width: frame.width * scale,
            height: ((shown * frame.width) / picture.width) * scale,
        },
    };
};
