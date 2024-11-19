import { type CatalogField } from '@lightdash/common';
import {
    Box,
    getDefaultZIndex,
    Portal,
    px,
    useMantineTheme,
} from '@mantine/core';
import MarkdownPreview from '@uiw/react-markdown-preview';
import { type MRT_TableInstance } from 'mantine-react-table';
import { useEffect, useRef, type FC } from 'react';
import { useLockScroll } from '../../../hooks/useLockScroll';

type Props = {
    isOpen: boolean;
    setIsOpen: (isOpen: boolean) => void;
    content: string;
    cellRef: React.RefObject<HTMLDivElement>;
    table: MRT_TableInstance<CatalogField>;
};

export const MetricCatalogCellOverlay: FC<Props> = ({
    isOpen,
    setIsOpen,
    content,
    cellRef,
    table,
}) => {
    const theme = useMantineTheme();
    const overlayRef = useRef<HTMLDivElement>(null);
    const pageRootRef = useRef<HTMLDivElement>(
        document.getElementById('page-root') as HTMLDivElement,
    );

    // Lock body and table container scroll when overlay is open
    useLockScroll(pageRootRef, isOpen);
    useLockScroll(table.refs.tableContainerRef, isOpen);

    useEffect(() => {
        // Close the overlay if clicked outside
        // NOTE: Mantine's useClickOutside hook doesn't work here
        const handleClickOutside = (event: MouseEvent) => {
            if (!isOpen) return;
            const clickedElement = event.target as Node;
            if (!overlayRef.current?.contains(clickedElement)) {
                setIsOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () =>
            document.removeEventListener('mousedown', handleClickOutside);
    }, [overlayRef, isOpen, setIsOpen]);

    const getCellRect = () => {
        if (!cellRef.current) return null;
        const rect = cellRef.current.getBoundingClientRect();

        return {
            top: rect.top + window.scrollY - px(theme.spacing.sm),
            left: rect.left + window.scrollX - px(theme.spacing.xl), // -16px - accounts for padding from parent
            width: rect.width + px(theme.spacing.xl) * 2, // +32px - accounts for padding from parent
        };
    };

    if (!isOpen || !content) return null;

    return (
        <Portal>
            <Box
                ref={overlayRef}
                pos="absolute"
                py="sm"
                px="xl"
                mah={500}
                sx={{
                    position: 'absolute',
                    ...getCellRect(),
                    backgroundColor: theme.fn.lighten(
                        theme.colors.violet[1],
                        0.8,
                    ),
                    border: `1px solid ${theme.colors.indigo[6]}`,
                    borderRadius: theme.radius.md,
                    zIndex: getDefaultZIndex('popover'),
                    overflowY: 'auto',
                    boxShadow: theme.shadows.sm,
                }}
            >
                <MarkdownPreview
                    source={content}
                    style={{
                        fontSize: theme.fontSizes.sm,
                        color: theme.colors.dark[4],
                        fontFamily: 'Inter',
                        backgroundColor: theme.fn.lighten(
                            theme.colors.violet[1],
                            0.8,
                        ),
                    }}
                    components={{
                        h1: ({ children }) => (
                            <h1 style={{ fontWeight: 600 }}>{children}</h1>
                        ),
                        h2: ({ children }) => (
                            <h2 style={{ fontWeight: 600 }}>{children}</h2>
                        ),
                        h3: ({ children }) => (
                            <h3 style={{ fontWeight: 600 }}>{children}</h3>
                        ),
                        p: ({ children }) => (
                            <p style={{ fontWeight: 400 }}>{children}</p>
                        ),
                        li: ({ children }) => (
                            <li style={{ fontWeight: 400 }}>{children}</li>
                        ),
                    }}
                />
            </Box>
        </Portal>
    );
};
