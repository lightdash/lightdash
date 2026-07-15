import { SegmentedControl } from '@mantine-8/core';
import { useEffect, useState } from 'react';
import { type DeepResearchDepth } from '../../deepResearch/types';
import { DeepResearchPreflight } from './DeepResearchPreflight';

export type AgentComposerMode = 'ask' | 'deep_research';

type Props = {
    question: string;
    projectUuid?: string;
    agentUuid?: string;
    onStart: (depth: DeepResearchDepth) => Promise<void>;
    onModeChange?: (mode: AgentComposerMode) => void;
    preflightRequest: number;
};

export const DeepResearchModeControl = ({
    question,
    projectUuid,
    agentUuid,
    onStart,
    onModeChange,
    preflightRequest,
}: Props) => {
    const [mode, setMode] = useState<AgentComposerMode>('ask');
    const [depth, setDepth] = useState<DeepResearchDepth>('standard');
    const [isPreflightOpen, setIsPreflightOpen] = useState(false);
    const [isStarting, setIsStarting] = useState(false);

    useEffect(() => {
        if (mode === 'deep_research' && preflightRequest > 0) {
            setIsPreflightOpen(true);
        }
    }, [mode, preflightRequest]);

    const selectMode = (nextMode: AgentComposerMode) => {
        setMode(nextMode);
        onModeChange?.(nextMode);
        if (nextMode === 'deep_research') {
            setIsPreflightOpen(true);
        }
    };

    const handleStart = async () => {
        setIsStarting(true);
        try {
            await onStart(depth);
            setIsPreflightOpen(false);
        } finally {
            setIsStarting(false);
        }
    };

    return (
        <>
            <SegmentedControl
                size="xs"
                value={mode}
                onChange={(value) => selectMode(value as AgentComposerMode)}
                data={[
                    { label: 'Ask', value: 'ask' },
                    { label: 'Deep research', value: 'deep_research' },
                ]}
                aria-label="Answer mode"
            />

            <DeepResearchPreflight
                opened={isPreflightOpen}
                onClose={() => setIsPreflightOpen(false)}
                question={question}
                depth={depth}
                onDepthChange={setDepth}
                onStart={() => void handleStart()}
                isStarting={isStarting}
                projectUuid={projectUuid}
                agentUuid={agentUuid}
            />
        </>
    );
};
