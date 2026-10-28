import { Box, type BoxProps, type MantineLoaderComponent } from '@mantine/core';
import { forwardRef, memo, type CSSProperties } from 'react';
import styles from './DotsLoader.module.css';

const DOTS = Array.from({ length: 3 }, (_, i) => `${i * 0.16}s`);

interface DotsLoaderProps extends BoxProps {
    delayedMessage?: string;
}

export const DotsLoader: MantineLoaderComponent = memo(
    forwardRef<HTMLDivElement, DotsLoaderProps>(
        ({ className, delayedMessage, ...props }, ref) => {
            return (
                <Box ref={ref} className={styles.container} {...props}>
                    {DOTS.map((delay) => (
                        <div
                            key={delay}
                            className={styles.dot}
                            style={{ '--dot-delay': delay } as CSSProperties}
                        />
                    ))}
                    <div className={styles.delayedMessage}>
                        {delayedMessage}
                    </div>
                </Box>
            );
        },
    ),
);
