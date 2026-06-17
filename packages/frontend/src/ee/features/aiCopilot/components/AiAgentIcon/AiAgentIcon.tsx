import { type CSSProperties, type FC } from 'react';
import styles from './AiAgentIcon.module.css';

type Props = {
    size?: number | string;
    className?: string;
    style?: CSSProperties;
};

export const AiAgentIcon: FC<Props> = ({
    size = 18,
    className,
    style,
}) => {
    const resolvedSize = typeof size === 'number' ? `${size}px` : size;

    return (
        <span
            aria-hidden="true"
            className={[styles.root, className].filter(Boolean).join(' ')}
            style={
                {
                    '--ai-agent-icon-size': resolvedSize,
                    ...style,
                } as CSSProperties
            }
        />
    );
};
