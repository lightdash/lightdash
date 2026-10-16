import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './TypingDots.module.css';

type TypingDotsProps = {
    label?: string;
};

export const TypingDots: FC<TypingDotsProps> = ({ label: labelProp }) => {
    const { t } = useTranslation('aiCopilotChat');
    const label = labelProp ?? t('typingDots.working');
    return (
        <div className={styles.indicator} role="status" aria-label={label}>
            <span className={styles.label} data-tour-status="true">
                {label}
            </span>
            <span className={styles.dots} aria-hidden="true">
                <span className={styles.dot} />
                <span className={styles.dot} />
                <span className={styles.dot} />
            </span>
        </div>
    );
};
