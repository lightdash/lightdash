import {
    useCallback,
    useEffect,
    useRef,
    useState,
    type DragEvent as ReactDragEvent,
} from 'react';

const hasFiles = (dataTransfer: DataTransfer | null) =>
    Array.from(dataTransfer?.types ?? []).includes('Files');

/**
 * Tracks whether the user is dragging files anywhere over the window and
 * exposes the handlers for the element that accepts the drop. Dropping
 * outside the target is swallowed so the browser never navigates to the file.
 */
export const useFileDropTarget = ({
    enabled,
    onDropFiles,
}: {
    enabled: boolean;
    onDropFiles: (files: File[]) => void;
}) => {
    const [isDraggingFiles, setIsDraggingFiles] = useState(false);
    // dragenter/dragleave fire for every child crossed, so count the depth.
    const depthRef = useRef(0);
    const onDropFilesRef = useRef(onDropFiles);
    onDropFilesRef.current = onDropFiles;

    const reset = useCallback(() => {
        depthRef.current = 0;
        setIsDraggingFiles(false);
    }, []);

    useEffect(() => {
        if (!enabled) {
            reset();
            return undefined;
        }
        const handleDragEnter = (event: DragEvent) => {
            if (!hasFiles(event.dataTransfer)) return;
            depthRef.current += 1;
            setIsDraggingFiles(true);
        };
        const handleDragLeave = (event: DragEvent) => {
            if (!hasFiles(event.dataTransfer)) return;
            depthRef.current = Math.max(0, depthRef.current - 1);
            if (depthRef.current === 0) setIsDraggingFiles(false);
        };
        const handleDragOver = (event: DragEvent) => {
            if (hasFiles(event.dataTransfer)) event.preventDefault();
        };
        const handleDrop = (event: DragEvent) => {
            if (!hasFiles(event.dataTransfer)) return;
            event.preventDefault();
            reset();
        };
        window.addEventListener('dragenter', handleDragEnter);
        window.addEventListener('dragleave', handleDragLeave);
        window.addEventListener('dragover', handleDragOver);
        window.addEventListener('drop', handleDrop);
        return () => {
            window.removeEventListener('dragenter', handleDragEnter);
            window.removeEventListener('dragleave', handleDragLeave);
            window.removeEventListener('dragover', handleDragOver);
            window.removeEventListener('drop', handleDrop);
        };
    }, [enabled, reset]);

    const onDragOver = useCallback(
        (event: ReactDragEvent<HTMLElement>) => {
            if (!enabled || !hasFiles(event.dataTransfer)) return;
            event.preventDefault();
            // eslint-disable-next-line no-param-reassign
            event.dataTransfer.dropEffect = 'copy';
        },
        [enabled],
    );

    const onDrop = useCallback(
        (event: ReactDragEvent<HTMLElement>) => {
            if (!enabled || !hasFiles(event.dataTransfer)) return;
            event.preventDefault();
            event.stopPropagation();
            reset();
            const files = Array.from(event.dataTransfer.files);
            if (files.length > 0) onDropFilesRef.current(files);
        },
        [enabled, reset],
    );

    return {
        isDraggingFiles: enabled && isDraggingFiles,
        dropTargetProps: { onDragOver, onDrop },
    };
};
