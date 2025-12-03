import { type CatalogField } from '@lightdash/common';
import { Box, Text, useMantineTheme } from '@mantine/core';
import MarkdownPreview, {
    type MarkdownPreviewProps,
} from '@uiw/react-markdown-preview';
import { type MRT_Row, type MRT_TableInstance } from 'mantine-react-table';
import { useRef, useState, type FC } from 'react';
import { useIsLineClamped } from '../../../hooks/useIsLineClamped';
import { useAppDispatch, useAppSelector } from '../../sqlRunner/store/hooks';
import { setDescriptionPopoverIsClosing } from '../store/metricsCatalogSlice';
import { MetricCatalogCellOverlay } from './MetricCatalogCellOverlay';

type Props = {
    row: MRT_Row<CatalogField>;
    table: MRT_TableInstance<CatalogField>;
};

export const MetricsCatalogColumnDescription: FC<Props> = ({ row, table }) => {
    const theme = useMantineTheme();
    const dispatch = useAppDispatch();
    const cellRef = useRef<HTMLDivElement>(null);
    const { ref: highlightRef, isLineClamped } =
        useIsLineClamped<HTMLDivElement>(2);
    const [isOpen, setIsOpen] = useState(false);
    const canOpen = isLineClamped && row.original.description;

    const isCategoryPopoverClosing = useAppSelector(
        (state) => state.metricsCatalog.popovers.category.isClosing,
    );
    const isDescriptionPopoverClosing = useAppSelector(
        (state) => state.metricsCatalog.popovers.description.isClosing,
    );

    const markdownPreviewProps: MarkdownPreviewProps = {
        style: {
            fontSize: theme.fontSizes.sm,
            color: theme.colors.ldGray[6],
            fontFamily: 'Inter',
            backgroundColor: 'inherit',
        },
        components: {
            h1: ({ children }) => (
                <h1 style={{ fontWeight: 600 }}>{children}</h1>
            ),
            h2: ({ children }) => (
                <h2 style={{ fontWeight: 600 }}>{children}</h2>
            ),
            h3: ({ children }) => (
                <h3 style={{ fontWeight: 600 }}>{children}</h3>
            ),
            p: ({ children }) => <p style={{ fontWeight: 400 }}>{children}</p>,
            li: ({ children }) => (
                <li style={{ fontWeight: 400 }}>{children}</li>
            ),
        },
    };

    return (
        <Box ref={cellRef}>
            <Text
                ref={highlightRef}
                c={row.original.description ? 'ldGray.6' : 'ldGray.4'}
                fz="sm"
                fw={400}
                lh="150%"
                onClick={() => {
                    if (
                        canOpen &&
                        !(
                            isCategoryPopoverClosing ||
                            isDescriptionPopoverClosing
                        )
                    ) {
                        setIsOpen(true);
                    }
                }}
                lineClamp={2}
                sx={{
                    cursor: canOpen ? 'pointer' : 'default',
                    color: row.original.description ? 'ldGray.6' : 'ldGray.4',
                }}
            >
                <MarkdownPreview
                    source={row.original.description ?? '\\-'}
                    {...markdownPreviewProps}
                />
            </Text>

            <MetricCatalogCellOverlay
                isOpen={isOpen}
                setIsOpen={(newIsOpen) => {
                    if (!newIsOpen) {
                        dispatch(setDescriptionPopoverIsClosing(true));
                        setIsOpen(false);

                        // Reset the closing state after a short delay
                        setTimeout(() => {
                            dispatch(setDescriptionPopoverIsClosing(false));
                        }, 100);
                    } else {
                        setIsOpen(true);
                    }
                }}
                content={row.original.description || ''}
                cellRef={cellRef}
                table={table}
                markdownPreviewProps={markdownPreviewProps}
            />
        </Box>
    );
};
