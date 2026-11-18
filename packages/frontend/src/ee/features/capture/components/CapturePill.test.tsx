import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { type VoiceOffReason } from '../useVoiceRecorder';
import CapturePill from './CapturePill';

const renderPill = (voiceOffReason: VoiceOffReason | null, finishing = false) =>
    render(
        <CapturePill
            startedAt={0}
            voice={voiceOffReason || !finishing ? 'off' : 'on'}
            voiceOffReason={voiceOffReason}
            finishing={finishing}
            atImageLimit={false}
            hidden={false}
            onStop={() => {}}
            onCancel={() => {}}
        />,
    );

describe('CapturePill', () => {
    it('says voice is not set up on the instance', () => {
        renderPill('not-set-up');
        expect(
            screen.getByText(
                'Voice is not set up on this instance. Hold Shift to draw.',
            ),
        ).toBeInTheDocument();
    });

    it('does not claim to transcribe when voice is not set up', () => {
        renderPill('not-set-up', true);
        expect(
            screen.getByText(
                'Voice is not set up on this instance. Hold Shift to draw.',
            ),
        ).toBeInTheDocument();
        expect(screen.queryByText('Transcribing your voice')).toBeNull();
    });

    it('keeps the caption for a blocked microphone', () => {
        renderPill('blocked');
        expect(
            screen.getByText(
                'Voice is off: microphone is blocked for this site or browser',
            ),
        ).toBeInTheDocument();
    });
});
