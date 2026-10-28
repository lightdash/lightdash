import { type AiAgentOrbPalette } from '@lightdash/common';
import { type CSSProperties, type FC } from 'react';
import styles from './AiAgentIcon.module.css';

type Props = {
    size?: number | string;
    muted?: boolean;
    animated?: boolean;
    calm?: boolean;
    // Overrides the brand violet; see getAiAgentOrbPalette for per-agent colors.
    palette?: AiAgentOrbPalette;
    className?: string;
    style?: CSSProperties;
};

const paletteVars = (palette: AiAgentOrbPalette): CSSProperties =>
    ({
        '--ai-agent-icon-base': palette.base,
        '--ai-agent-icon-light': palette.light,
        '--ai-agent-icon-lighter': palette.lighter,
        '--ai-agent-icon-deep': palette.deep,
        '--ai-agent-icon-accent': palette.accent,
    }) as CSSProperties;

export const AiAgentIcon: FC<Props> = ({
    size = 16,
    muted = false,
    animated = false,
    calm = false,
    palette,
    className,
    style,
}) => {
    const resolvedSize = typeof size === 'number' ? `${size}px` : size;

    return (
        <span
            aria-hidden="true"
            data-ai-agent-icon=""
            className={[styles.wrap, className].filter(Boolean).join(' ')}
            style={
                {
                    '--ai-agent-icon-size': resolvedSize,
                    ...(palette ? paletteVars(palette) : {}),
                    ...style,
                } as CSSProperties
            }
        >
            <span
                className={[
                    styles.root,
                    muted && styles.muted,
                    animated && styles.animated,
                    calm && styles.calm,
                ]
                    .filter(Boolean)
                    .join(' ')}
            />
        </span>
    );
};
