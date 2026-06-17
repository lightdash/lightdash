import { type CSSProperties, type FC } from 'react';
import styles from './AiAgentIcon.module.css';

type Props = {
    size?: number | string;
    muted?: boolean;
    className?: string;
    style?: CSSProperties;
};

export const AiAgentIcon: FC<Props> = ({
    size = 16,
    muted = false,
    className,
    style,
}) => {
    const resolvedSize = typeof size === 'number' ? `${size}px` : size;

    return (
        <span
            aria-hidden="true"
            className={[styles.root, muted && styles.muted, className]
                .filter(Boolean)
                .join(' ')}
            style={
                {
                    '--ai-agent-icon-size': resolvedSize,
                    ...style,
                } as CSSProperties
            }
        />
    );
};
