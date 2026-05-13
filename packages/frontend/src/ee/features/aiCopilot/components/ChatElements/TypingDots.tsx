import { type FC } from 'react';
import styles from './TypingDots.module.css';

export const TypingDots: FC = () => (
    <div className={styles.dots} role="status" aria-label="Thinking">
        <span className={styles.dot} />
        <span className={styles.dot} />
        <span className={styles.dot} />
    </div>
);
