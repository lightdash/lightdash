import { useEffect, useRef, type FC, type ReactNode } from 'react';

type StickyWithDetectionProps = {
    /**
     * React children to render
     */
    children: ReactNode;
    /**
     * The top offset of the sticky element (should match CSS top value)
     */
    offset?: number;
    /**
     * Optional scrolling container element. Defaults to document.body
     */
    scrollContainer?: HTMLElement | null;
    /**
     * Callback that fires when stuck state changes
     */
    onStuckChange: (isStuck: boolean) => void;
};

/**
 * Wrapper component that detects when a sticky element becomes stuck.
 * Uses IntersectionObserver to detect when the sentinel element crosses the sticky threshold.
 *
 * @example
 * ```tsx
 * const [isStuck, setIsStuck] = useState(false);
 *
 * <StickyWithDetection offset={50} onStuckChange={setIsStuck}>
 *   <div data-is-stuck={isStuck}>
 *     Header content
 *   </div>
 * </StickyWithDetection>
 * ```
 */
export const StickyWithDetection: FC<StickyWithDetectionProps> = ({
    children,
    offset = 0,
    scrollContainer,
    onStuckChange,
}) => {
    const sentinelRef = useRef<HTMLDivElement>(null);
    const onStuckChangeRef = useRef(onStuckChange);

    useEffect(() => {
        onStuckChangeRef.current = onStuckChange;
    }, [onStuckChange]);

    useEffect(() => {
        const sentinel = sentinelRef.current;
        if (!sentinel) return;

        const container = scrollContainer || document.body;

        const rootMargin = offset > 0 ? `-${offset}px 0px 0px 0px` : '0px';

        const observer = new IntersectionObserver(
            ([entry]) => {
                onStuckChangeRef.current(!entry.isIntersecting);
            },
            {
                root: container,
                threshold: 0,
                rootMargin,
            },
        );

        observer.observe(sentinel);

        return () => {
            observer.disconnect();
        };
    }, [offset, scrollContainer]);

    return (
        <>
            <div
                ref={sentinelRef}
                style={{
                    height: '1px',
                    marginTop: '-1px',
                    pointerEvents: 'none',
                }}
            />
            {children}
        </>
    );
};
