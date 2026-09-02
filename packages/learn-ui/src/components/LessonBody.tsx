import { useEffect, useMemo, useRef, useState, type FC } from 'react';
import { createPortal } from 'react-dom';
import { wireCitations } from '../model/citations';
import { type LearnDemo as LearnDemoManifest } from '../types';
import { LearnDemo } from './LearnDemo';
import styles from './LearnLesson.module.css';

type DemoMount = { id: string; element: HTMLElement };

export type LessonBodyProps = {
    /** Sanitised lesson HTML; the host is responsible for sanitising. */
    html: string;
    demos: Record<string, LearnDemoManifest>;
    assetBaseUrl: string;
    /** Runs after every html change with the lesson root; defaults to citation wiring. */
    onMount?: (root: HTMLElement) => (() => void) | void;
};

export const LessonBody: FC<LessonBodyProps> = ({
    html,
    demos,
    assetBaseUrl,
    onMount = wireCitations,
}) => {
    // One object per html string: a fresh { __html } each render would make
    // React reset the injected HTML and wipe the demo portals mounted inside it.
    const markup = useMemo(() => ({ __html: html }), [html]);
    const rootRef = useRef<HTMLDivElement>(null);
    const [mounts, setMounts] = useState<DemoMount[]>([]);

    useEffect(() => {
        const el = rootRef.current;
        if (!el) {
            setMounts([]);
            return undefined;
        }
        setMounts(
            Array.from(el.querySelectorAll<HTMLElement>('div[data-demo]')).map(
                (element) => ({
                    id: element.getAttribute('data-demo') ?? '',
                    element,
                }),
            ),
        );
        return onMount(el) ?? undefined;
    }, [html, onMount]);

    return (
        <>
            {/* eslint-disable-next-line react/no-danger */}
            <div
                ref={rootRef}
                className={styles.lesson}
                dangerouslySetInnerHTML={markup}
            />
            {mounts.map(({ id, element }, index) => {
                const demo = Object.prototype.hasOwnProperty.call(demos, id)
                    ? demos[id]
                    : undefined;
                if (!demo || !element.isConnected) return null;
                return createPortal(
                    <LearnDemo demo={demo} assetBaseUrl={assetBaseUrl} />,
                    element,
                    `${index}-${id}`,
                );
            })}
        </>
    );
};
