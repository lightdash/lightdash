/** A sandboxed app frame on the page and how to ask it for its own picture. */
export type AppFrame = {
    getElement: () => HTMLIFrameElement | null;
    capture: () => Promise<Blob>;
};

const frames = new Set<AppFrame>();

/** Lists a mounted app frame, so a page picture can include what it draws. Returns the way to take it off the list. */
export const registerAppFrame = (frame: AppFrame): (() => void) => {
    frames.add(frame);
    return () => {
        frames.delete(frame);
    };
};

export const mountedAppFrames = (): AppFrame[] => [...frames];
