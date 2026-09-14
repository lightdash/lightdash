import { type ManagedAgentRun } from '@lightdash/common';
import { type FC } from 'react';
import TruncatedText from '../../../components/common/TruncatedText';

export const ManagedAgentRunModel: FC<{
    run: Pick<ManagedAgentRun, 'modelName' | 'modelProvider'>;
}> = ({ run }) => (
    <TruncatedText maxWidth={280} fz="xs" c="dimmed">
        {run.modelName
            ? [run.modelProvider, run.modelName].filter(Boolean).join(' · ')
            : 'Model not recorded'}
    </TruncatedText>
);
