import { IconX } from '@tabler/icons-react';
import { forwardRef, useEffect, useState } from 'react';
import { formatClock } from '../buildSummary';
import { type VoiceState } from '../types';
import classes from './CapturePill.module.css';

type Props = {
    startedAt: number;
    voice: VoiceState;
    liveText: string;
    /** Set when voice started but the browser cannot transcribe. */
    voiceProblem: string | null;
    /** Why voice is off, as reported by the browser. */
    voiceOffReason: string | null;
    atImageLimit: boolean;
    /** Hidden for a moment while the screen is photographed. */
    hidden: boolean;
    onStop: () => void;
    onCancel: () => void;
};

const LIVE_TEXT_LENGTH = 80;

const voiceOffCaption = (reason: string | null): string => {
    if (reason === 'waiting') return 'Waiting for microphone permission';
    if (reason === 'not-allowed' || reason === 'service-not-allowed')
        return 'Voice is off: microphone is blocked for this site or browser';
    if (reason === 'audio-capture') return 'Voice is off: no microphone found';
    return reason ? `Voice is off (${reason})` : 'Voice is off';
};

const CapturePill = forwardRef<HTMLDivElement, Props>(
    (
        {
            startedAt,
            voice,
            liveText,
            voiceProblem,
            voiceOffReason,
            atImageLimit,
            hidden,
            onStop,
            onCancel,
        },
        ref,
    ) => {
        const [elapsedMs, setElapsedMs] = useState(0);
        useEffect(() => {
            const timer = window.setInterval(
                () => setElapsedMs(performance.now() - startedAt),
                250,
            );
            return () => window.clearInterval(timer);
        }, [startedAt]);

        let caption = liveText.slice(-LIVE_TEXT_LENGTH);
        if (voice === 'off') caption = voiceOffCaption(voiceOffReason);
        if (voiceProblem)
            caption = `Voice is not working in this browser (${voiceProblem})`;
        if (atImageLimit) caption = 'Image limit reached';
        if (!caption) caption = 'Hold Shift to draw';

        return (
            <div
                ref={ref}
                className={classes.wrapper}
                data-hidden={hidden}
                tabIndex={-1}
                role="status"
            >
                <div className={classes.pill}>
                    <span className={classes.dot} />
                    <span className={classes.timer}>
                        {formatClock(elapsedMs)}
                    </span>
                    <span className={classes.divider} />
                    <button
                        type="button"
                        className={classes.stop}
                        onClick={onStop}
                    >
                        Stop
                    </button>
                    <span className={classes.divider} />
                    <button
                        type="button"
                        className={classes.cancel}
                        onClick={onCancel}
                        aria-label="Cancel capture"
                    >
                        <IconX size={16} />
                    </button>
                </div>
                <div className={classes.caption}>{caption}</div>
            </div>
        );
    },
);

export default CapturePill;
