import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type KeyboardEvent,
    type MouseEvent,
    type PointerEvent,
    type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import type { VizContextRow } from '@lightdash/query-sdk';

export type VizActionPoint = {
    key: string;
    row: VizContextRow;
    metric: string;
    fieldId?: string;
    label: string;
    formattedValue: string;
};

type VizAction = {
    enabled: boolean;
    open: (options: {
        row: VizContextRow;
        metric: string;
        fieldId?: string;
    }) => Promise<void>;
};

type UseVizActionsOptions = {
    underlyingData: VizAction;
    drillDown: VizAction;
};

type MenuState = VizActionPoint & {
    keyboard: boolean;
    x: number;
    y: number;
};

type MarkProps = {
    ref: (node: HTMLElement | SVGElement | null) => void;
    role?: 'button';
    tabIndex?: 0;
    'aria-label'?: string;
    onClick?: (event: MouseEvent<HTMLElement | SVGElement>) => void;
    onKeyDown?: (event: KeyboardEvent<HTMLElement | SVGElement>) => void;
    onPointerMove?: (event: PointerEvent<HTMLElement | SVGElement>) => void;
};

function centerOf(element: Element) {
    const rect = element.getBoundingClientRect();
    return {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
    };
}

/**
 * Adds the standard host-owned underlying-data and drill-down menu to a viz
 * mark. Keep the original source row and the declared metric slot on `point`.
 */
export function useVizActions({
    underlyingData,
    drillDown,
}: UseVizActionsOptions): {
    getMarkProps: (point: VizActionPoint) => MarkProps;
    menu: ReactNode;
    tooltipVisible: boolean;
} {
    const markElements = useRef(new Map<string, HTMLElement | SVGElement>());
    const markRefs = useRef(
        new Map<string, (node: HTMLElement | SVGElement | null) => void>(),
    );
    const focusOnCloseKey = useRef<string | null>(null);
    const [menuState, setMenuState] = useState<MenuState | null>(null);
    const [tooltipVisible, setTooltipVisible] = useState(true);
    const actionsEnabled = underlyingData.enabled || drillDown.enabled;

    const closeMenu = useCallback(
        (menu: MenuState) => {
            focusOnCloseKey.current = menu.keyboard ? menu.key : null;
            setMenuState(null);
        },
        [],
    );

    useEffect(() => {
        if (actionsEnabled || !menuState) return;
        closeMenu(menuState);
    }, [actionsEnabled, closeMenu, menuState]);

    useEffect(() => {
        if (tooltipVisible || menuState) return;
        const showTooltip = () => setTooltipVisible(true);
        document.addEventListener('pointermove', showTooltip, { once: true });
        return () => document.removeEventListener('pointermove', showTooltip);
    }, [menuState, tooltipVisible]);

    const openMenu = useCallback(
        (
            point: VizActionPoint,
            activator: HTMLElement | SVGElement,
            anchor: { keyboard: boolean; x?: number; y?: number },
        ) => {
            if (!actionsEnabled) return;
            const center = centerOf(activator);
            focusOnCloseKey.current = null;
            setTooltipVisible(false);
            setMenuState({
                ...point,
                keyboard: anchor.keyboard,
                x: anchor.keyboard ? center.x : (anchor.x ?? center.x),
                y: anchor.keyboard ? center.y : (anchor.y ?? center.y),
            });
            if (!anchor.keyboard) activator.blur();
        },
        [actionsEnabled],
    );

    const getMarkProps = useCallback(
        (point: VizActionPoint): MarkProps => {
            let ref = markRefs.current.get(point.key);
            if (!ref) {
                let ownedNode: HTMLElement | SVGElement | null = null;
                ref = (node) => {
                    if (node) {
                        ownedNode = node;
                        markElements.current.set(point.key, node);
                        return;
                    }

                    if (markElements.current.get(point.key) === ownedNode) {
                        markElements.current.delete(point.key);
                    }
                    if (markRefs.current.get(point.key) === ref) {
                        markRefs.current.delete(point.key);
                    }
                    ownedNode = null;
                };
                markRefs.current.set(point.key, ref);
            }

            if (!actionsEnabled) return { ref };

            return {
                ref,
                role: 'button',
                tabIndex: 0,
                'aria-label': point.label,
                onPointerMove: () => {
                    if (!menuState) setTooltipVisible(true);
                },
                onClick: (event) => {
                    const activator = event.currentTarget;
                    const keyboard = event.detail === 0;
                    openMenu(point, activator, {
                        keyboard,
                        x: event.clientX,
                        y: event.clientY,
                    });
                },
                onKeyDown: (event) => {
                    if (event.key !== 'Enter' && event.key !== ' ') return;
                    event.preventDefault();
                    openMenu(point, event.currentTarget, { keyboard: true });
                },
            };
        },
        [actionsEnabled, menuState, openMenu],
    );

    const menu = useMemo(() => {
        if (!actionsEnabled || !menuState || typeof document === 'undefined') return null;
        const currentMenu = menuState;
        const closeCurrentMenu = () => closeMenu(currentMenu);
        const runAction = (action: VizAction) => {
            void action
                .open({
                    row: currentMenu.row,
                    metric: currentMenu.metric,
                    fieldId: currentMenu.fieldId,
                })
                .catch(() => {});
            closeCurrentMenu();
        };

        return createPortal(
            <DropdownMenu.Root
                open
                onOpenChange={(open) => {
                    if (!open) closeCurrentMenu();
                }}
            >
                <DropdownMenu.Trigger asChild>
                    <span
                        aria-hidden
                        style={{
                            position: 'fixed',
                            left: currentMenu.x,
                            top: currentMenu.y,
                            width: 1,
                            height: 1,
                        }}
                    />
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                    <DropdownMenu.Content
                        sideOffset={4}
                        className="z-50 min-w-32 overflow-hidden rounded-md p-1 text-sm"
                        onCloseAutoFocus={(event) => {
                            event.preventDefault();
                            if (focusOnCloseKey.current === currentMenu.key) {
                                focusOnCloseKey.current = null;
                                queueMicrotask(() => {
                                    markElements.current.get(currentMenu.key)?.focus();
                                });
                            }
                        }}
                    >
                        {underlyingData.enabled && (
                            <DropdownMenu.Item
                                className="cursor-pointer select-none rounded-sm px-2 py-1.5 outline-none"
                                onSelect={() => runAction(underlyingData)}
                            >
                                View underlying data
                            </DropdownMenu.Item>
                        )}
                        {drillDown.enabled && (
                            <DropdownMenu.Item
                                className="cursor-pointer select-none rounded-sm px-2 py-1.5 outline-none"
                                onSelect={() => runAction(drillDown)}
                            >
                                Drill into {currentMenu.formattedValue}
                            </DropdownMenu.Item>
                        )}
                    </DropdownMenu.Content>
                </DropdownMenu.Portal>
            </DropdownMenu.Root>,
            document.body,
        );
    }, [actionsEnabled, closeMenu, drillDown, menuState, underlyingData]);

    return { getMarkProps, menu, tooltipVisible };
}
