import { type FC } from 'react';
import styles from './TypingDots.module.css';

export const TypingDots: FC = () => (
    <div
        className={styles.indicator}
        role="status"
        aria-label="Working on your request"
    >
        <span className={styles.label}>Working on your request</span>
        <span className={styles.dots} aria-hidden="true">
            <span className={styles.dot} />
            <span className={styles.dot} />
            <span className={styles.dot} />
        </span>
    </div>
);
