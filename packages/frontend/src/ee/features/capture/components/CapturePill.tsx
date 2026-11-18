import { IconX } from '@tabler/icons-react';
import { forwardRef, useEffect, useState } from 'react';
import { formatClock } from '../buildSummary';
import { type VoiceState } from '../types';
import { type VoiceOffReason } from '../useVoiceRecorder';
import classes from './CapturePill.module.css';

type Props = {
    startedAt: number;
    voice: VoiceState;
    voiceOffReason: VoiceOffReason | null;
    /** Stop was pressed and the audio is being transcribed. */
    finishing: boolean;
    atImageLimit: boolean;
    /** Hidden for a moment while the screen is photographed. */
    hidden: boolean;
    onStop: () => void;
    onCancel: () => void;
};

const VOICE_OFF_CAPTIONS: Record<VoiceOffReason, string> = {
    blocked: 'Voice is off: microphone is blocked for this site or browser',
    'no-microphone': 'Voice is off: no microphone found',
    unsupported: 'Voice is off: this browser cannot record audio',
    'not-set-up': 'Voice is not set up on this instance. Hold Shift to draw.',
};

const CapturePill = forwardRef<HTMLDivElement, Props>(
    (
        {
            startedAt,
            voice,
            voiceOffReason,
            finishing,
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

        let caption = 'Hold Shift to draw, and talk';
        if (voice === 'off') {
            caption = voiceOffReason
                ? VOICE_OFF_CAPTIONS[voiceOffReason]
                : 'Voice is off';
        }
        if (atImageLimit) caption = 'Image limit reached';
        if (finishing) {
            // Nothing is transcribed when the instance has no voice.
            caption =
                voiceOffReason === 'not-set-up'
                    ? VOICE_OFF_CAPTIONS['not-set-up']
                    : 'Transcribing your voice';
        }

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
                        disabled={finishing}
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
