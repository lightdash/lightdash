import { type AiAgentJevDecision } from '@lightdash/common';
import { Text, Tooltip } from '@mantine/core';
import { type FC } from 'react';
import { describeJevDecision } from './jevDecision';

export const JevDecisionIndicator: FC<{ decision: AiAgentJevDecision }> = ({
    decision,
}) => {
    const { applied, label, detail } = describeJevDecision(decision);
    return (
        <Tooltip label={detail} maw={280} multiline>
            <Text
                fz="xs"
                fw={applied ? 500 : 400}
                c={applied ? 'indigo' : 'dimmed'}
            >
                {label}
            </Text>
        </Tooltip>
    );
};
