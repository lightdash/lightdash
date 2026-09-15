import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReportHeading } from './DocumentReportLayout';

const ACTIVE_HEADING_OFFSET = 48;

export const useReportContents = (
    headings: ReportHeading[],
    headingSelector?: string,
) => {
    const bodyRef = useRef<HTMLDivElement>(null);
    const headerRef = useRef<HTMLElement>(null);
    const viewportRef = useRef<HTMLDivElement>(null);
    const [activeSection, setActiveSection] = useState<string | null>(null);

    const getHeadingNodes = useCallback(
        () =>
            Array.from(
                bodyRef.current?.querySelectorAll<HTMLElement>(
                    headingSelector ?? '[data-report-heading]',
                ) ?? [],
            ),
        [headingSelector],
    );

    useEffect(() => {
        if (!headingSelector) {
            return undefined;
        }
        const frame = window.requestAnimationFrame(() => {
            getHeadingNodes().forEach((node, index) => {
                const heading = headings[index];
                if (heading) {
                    node.id = heading.id;
                    node.dataset.reportHeading = '';
                }
            });
        });
        return () => window.cancelAnimationFrame(frame);
    }, [getHeadingNodes, headings, headingSelector]);

    const updateActiveSection = useCallback(() => {
        const viewport = viewportRef.current;
        if (!viewport) {
            return;
        }
        const nodes = getHeadingNodes();
        const viewportTop = viewport.getBoundingClientRect().top;
        const active = nodes
            .filter(
                (node) =>
                    node.getBoundingClientRect().top - viewportTop <=
                    ACTIVE_HEADING_OFFSET,
            )
            .at(-1);
        const isAtEnd =
            viewport.scrollHeight > viewport.clientHeight &&
            viewport.scrollHeight -
                viewport.scrollTop -
                viewport.clientHeight <=
                2;
        setActiveSection(
            isAtEnd ? (nodes.at(-1)?.id ?? null) : (active?.id ?? null),
        );
    }, [getHeadingNodes]);

    const scrollToHeading = (id: string | null) => {
        const node =
            id === null
                ? headerRef.current
                : getHeadingNodes().find((heading) => heading.id === id);
        if (node) {
            setActiveSection(id);
            node.scrollIntoView({ block: 'start' });
        }
    };

    return {
        bodyRef,
        headerRef,
        viewportRef,
        activeSection,
        updateActiveSection,
        scrollToHeading,
    };
};
