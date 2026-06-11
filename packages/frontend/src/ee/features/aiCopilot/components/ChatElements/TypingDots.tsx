import { type FC } from 'react';
import styles from './TypingDots.module.css';

type TypingDotsProps = {
    label?: string;
};

export const TypingDots: FC<TypingDotsProps> = ({
    label = 'Working on your request',
}) => (
    <div className={styles.indicator} role="status" aria-label={label}>
        <span className={styles.label}>{label}</span>
        <span className={styles.dots} aria-hidden="true">
            <span className={styles.dot} />
            <span className={styles.dot} />
            <span className={styles.dot} />
        </span>
    </div>
);
