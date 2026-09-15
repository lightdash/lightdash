import {
    Splitter,
    type SplitterPaneProps,
    type SplitterProps,
} from '@mantine/core';
import { useDebouncedValue, type SplitterPaneSize } from '@mantine/hooks';
import { Children, useEffect, useState, type ReactElement } from 'react';
import { z } from 'zod';
import classes from './ResizableSplitter.module.css';

const sizeSchema = z.union([
    z.number().finite().nonnegative(),
    z.templateLiteral([z.number().nonnegative(), z.enum(['%', 'px', 'rem'])]),
]);
const layoutsSchema = z.record(z.string(), z.array(sizeSchema));
type Layouts = Record<string, SplitterPaneSize[]>;

const readLayouts = (storageKey: string | undefined): Layouts => {
    if (!storageKey) return {};
    try {
        const saved = localStorage.getItem(`lightdash-splitter:${storageKey}`);
        if (saved) return layoutsSchema.parse(JSON.parse(saved));

        const legacy = localStorage.getItem(
            `react-resizable-panels:${storageKey}`,
        );
        if (!legacy) return {};
        const layouts = z
            .record(
                z.string(),
                z.object({
                    layout: z.array(z.number().finite().nonnegative()),
                }),
            )
            .parse(JSON.parse(legacy));
        return Object.fromEntries(
            Object.entries(layouts).map(([key, value]) => [key, value.layout]),
        );
    } catch {
        return {};
    }
};

type Props = SplitterProps & {
    /** Panes must be direct children with stable ids. */
    children: React.ReactNode;
    storageKey?: string;
    handleLabel?: string;
    resizable?: boolean;
};

const ResizableSplitter = ({
    children,
    storageKey,
    handleLabel = 'Resize panels',
    resizable = true,
    sizes,
    onSizeChange,
    classNames,
    ...props
}: Props) => {
    const panes = Children.toArray(
        children,
    ) as ReactElement<SplitterPaneProps>[];
    const layoutKey = panes.map((pane) => pane.props.id).join(',');
    const [layouts, setLayouts] = useState<Layouts>(() =>
        readLayouts(storageKey),
    );
    const [savedLayouts] = useDebouncedValue(layouts, 200);
    const savedSizes = layouts[layoutKey];
    const defaultSizes =
        panes.length === 1
            ? [100]
            : panes.map((pane) => pane.props.defaultSize);
    const layoutSizes =
        savedSizes?.length === panes.length ? savedSizes : defaultSizes;

    useEffect(() => {
        if (!storageKey || Object.keys(savedLayouts).length === 0) return;
        try {
            localStorage.setItem(
                `lightdash-splitter:${storageKey}`,
                JSON.stringify(savedLayouts),
            );
        } catch {
            // Resizing remains available when browser storage is disabled.
        }
    }, [storageKey, savedLayouts]);

    return (
        <Splitter
            h="100%"
            w="100%"
            miw={0}
            mih={0}
            withHandle={false}
            lineSize={1}
            redistribute="nearest"
            resetOnDoubleClick={false}
            {...props}
            classNames={(theme, splitterProps, context) => {
                const custom =
                    typeof classNames === 'function'
                        ? classNames(theme, splitterProps, context)
                        : classNames;
                return {
                    ...custom,
                    thumb: [classes.thumb, custom?.thumb]
                        .filter(Boolean)
                        .join(' '),
                    root: [classes.root, custom?.root]
                        .filter(Boolean)
                        .join(' '),
                    pane: [classes.pane, custom?.pane]
                        .filter(Boolean)
                        .join(' '),
                    handle: [classes.handle, custom?.handle]
                        .filter(Boolean)
                        .join(' '),
                };
            }}
            attributes={{
                ...props.attributes,
                handle: {
                    'aria-label': handleLabel,
                    ...props.attributes?.handle,
                    onPointerDownCapture: (
                        event: React.PointerEvent<HTMLDivElement>,
                    ) => {
                        if (!resizable) {
                            event.stopPropagation();
                        } else if (event.button === 0) {
                            // Keep receiving drag events over iframe previews.
                            event.currentTarget.setPointerCapture(
                                event.pointerId,
                            );
                        }
                    },
                    ...(resizable
                        ? {}
                        : {
                              'aria-disabled': true,
                              inert: true,
                              onKeyDownCapture: (event: React.KeyboardEvent) =>
                                  event.stopPropagation(),
                          }),
                },
            }}
            sizes={sizes ?? layoutSizes}
            onSizeChange={(nextSizes) => {
                setLayouts((current) => ({
                    ...current,
                    [layoutKey]: nextSizes,
                }));
                onSizeChange?.(nextSizes);
            }}
        >
            {children}
        </Splitter>
    );
};

ResizableSplitter.Pane = Splitter.Pane;
export default ResizableSplitter;
