import _ from 'lodash';
import React, { FC, useEffect, useRef, useState } from 'react';

const containerStyles = {
    boxSizing: 'border-box',
    height: '100%',
    width: '100%',
    overflow: 'hidden',
    textAlign: 'center',
} as React.CSSProperties;

const dynamicTextStyles = {
    whiteSpace: 'nowrap',
    display: 'inline',
    verticalAlign: 'middle',
} as React.CSSProperties;

export interface AutoFitTextProps
    extends React.ComponentPropsWithoutRef<'div'> {
    min?: number;
    max?: number;
    start?: number;
    throttle?: number;
    step?: number;
    hideOnMount?: boolean;
    hideOnCalc?: boolean;
    onStart?: () => void;
    onEnd?: () => void;
    onFontSize?: (fontSize: number) => void;
}

const AutoFitText: FC<AutoFitTextProps> = ({
    min = 5,
    max = 100,
    start = 50,
    throttle = 0,
    step = 5,
    hideOnMount = true,
    hideOnCalc = false,
    onStart = () => {},
    onEnd = () => {},
    onFontSize = () => {},
    children,
    ...rest
}) => {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const textRef = useRef<HTMLDivElement | null>(null);
    const [hide, setHide] = useState(hideOnMount);

    function elementSize() {
        if (textRef.current && containerRef.current) {
            return {
                text: {
                    width: textRef.current?.getBoundingClientRect()?.width,
                    height: textRef.current?.getBoundingClientRect()?.height,
                },
                container: {
                    width: containerRef.current?.getBoundingClientRect()?.width,
                    height: containerRef.current?.getBoundingClientRect()
                        ?.height,
                },
            };
        }
        return {
            text: { width: 0, height: 0 },
            container: { width: 0, height: 0 },
        };
    }

    function currentFontSize(): number {
        if (textRef.current) {
            return parseFloat(textRef.current.style.fontSize.replace('px', ''));
        }
        return 0;
    }

    function changeFontSize(operation: string, value: number) {
        if (textRef.current) {
            switch (operation) {
                case 'set':
                    textRef.current.style.fontSize = `${value}px`;
                    break;
                case 'increase':
                    textRef.current.style.fontSize = `${
                        currentFontSize() + value
                    }px`;
                    break;
                case 'decrease':
                    textRef.current.style.fontSize = `${
                        currentFontSize() - value
                    }px`;
                    break;
                default:
                    break;
            }
            onFontSize(currentFontSize());
        }
    }

    function textTooSmall(): Promise<void> {
        return new Promise((resolve) => {
            if (hideOnCalc) setHide(true);

            const growText = _.throttle(() => {
                if (currentFontSize() >= max) {
                    changeFontSize('set', max);
                    resolve();
                    return;
                }

                if (
                    elementSize().text.width < elementSize().container.width &&
                    elementSize().text.height < elementSize().container.height
                ) {
                    changeFontSize('increase', step);
                    growText();
                } else {
                    resolve();
                }
            }, throttle);
            growText();
        });
    }

    function textTooBig(): Promise<void> {
        return new Promise((resolve) => {
            if (hideOnCalc) setHide(true);

            const shrinkText = _.throttle(() => {
                if (currentFontSize() <= min) {
                    changeFontSize('set', min);
                    resolve();
                    return;
                }

                if (
                    elementSize().text.width > elementSize().container.width ||
                    elementSize().text.height > elementSize().container.height
                ) {
                    changeFontSize('decrease', step);
                    shrinkText();
                } else {
                    resolve();
                }
            }, throttle);
            shrinkText();
        });
    }

    const adjustText = _.debounce(async () => {
        if (textRef.current) {
            onStart();
            onFontSize(currentFontSize());
            await textTooSmall();
            await textTooBig();
            setHide(false);
            onEnd();
        }
    }, 100);

    useEffect(() => {
        if (containerRef.current) {
            const container = containerRef.current;
            const resizeObserver = new window.ResizeObserver(() =>
                adjustText(),
            );
            resizeObserver.observe(container);
            return () => resizeObserver.unobserve(container);
        }
    }, [
        min,
        max,
        start,
        throttle,
        step,
        hideOnMount,
        hideOnCalc,
        children,
        adjustText,
    ]);

    return (
        <div
            ref={containerRef}
            {...rest}
            style={{ ...containerStyles, ...rest.style }}
        >
            <div
                ref={textRef}
                style={{
                    ...dynamicTextStyles,
                    opacity: hide ? 0 : 1,
                    fontSize: `${start}px`,
                }}
            >
                {children}
            </div>
        </div>
    );
};

export default AutoFitText;
