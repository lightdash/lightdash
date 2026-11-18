import { type GuidedTourStep } from '../../../../components/common/GuidedTour';

export type VoiceDesignSurface = 'dashboard' | 'builder' | 'app';

/** `data-tour` value on each surface's Voice Design button. */
export const VOICE_DESIGN_BUTTON_TOUR_ID = 'voice-design-button';

const AFTER_STOP: Record<VoiceDesignSurface, string> = {
    dashboard:
        'Layout changes, like moving or swapping charts, happen straight away as a preview you can save or discard. Questions and other changes go to the AI agent with your marked-up screenshots.',
    builder:
        'Your marks, your words and the marked-up screenshots land in the prompt box, ready to send.',
    app: 'Your questions go to the AI agent with your marked-up screenshots. It can change the app too, if you ask and you can edit it.',
};

/** The first-run tour for Voice Design on one surface. */
export const voiceDesignTourSteps = (
    surface: VoiceDesignSurface,
): GuidedTourStep[] => [
    {
        target: `[data-tour="${VOICE_DESIGN_BUTTON_TOUR_ID}"]`,
        title: 'Meet Voice Design',
        body: 'Point at things and talk instead of typing. Press this button to start a recording.',
    },
    {
        target: null,
        title: 'Draw while you talk',
        body: 'Hold Shift and move the mouse to draw circles, lines and arrows on the page. Say what you want as you go. You can scroll and click between marks.',
    },
    {
        target: null,
        title: 'Press Stop when you are done',
        body: AFTER_STOP[surface],
    },
    ...(surface === 'builder'
        ? []
        : [
              {
                  target: null,
                  title: 'Keep the conversation going',
                  body: 'If the agent panel is open, your next recording joins that conversation. Close the panel to start a new one.',
              },
          ]),
];
