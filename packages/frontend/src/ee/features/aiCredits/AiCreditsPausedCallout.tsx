import {
    getAiCreditsPausedMessage,
    type AiCreditHold,
} from '@lightdash/common';
import { type FC } from 'react';
import Callout from '../../../components/common/Callout';

export const AiCreditsPausedCallout: FC<{ hold: AiCreditHold }> = ({
    hold,
}) => (
    <Callout variant="warning" title="AI features that use credits are paused">
        {getAiCreditsPausedMessage({
            reason: hold.reason,
            audience: 'admin',
            // Admins are already on the AI credits page.
            settingsUrl: null,
        })}
    </Callout>
);
