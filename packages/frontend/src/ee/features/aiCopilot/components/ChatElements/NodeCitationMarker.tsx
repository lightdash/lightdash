import {
    interpolateUiString,
    type AiAgentMessageAssistant,
} from '@lightdash/common';
import { UnstyledButton } from '@mantine/core';
import { type FC } from 'react';
import { useUiStrings } from '../../../../providers/Embed/useUiStrings';
import {
    clearPreview,
    selectPreview,
    setPreview,
} from '../../store/aiArtifactSlice';
import {
    useAiAgentStoreDispatch,
    useAiAgentStoreSelector,
} from '../../store/hooks';
import styles from './MemoryCitation.module.css';

type Props = {
    nodeId: string;
    /** Null while the answer streams or resolves: the marker is inert. */
    citationNumber: number | null;
    label: string | undefined;
    message: AiAgentMessageAssistant;
    projectUuid: string;
    agentUuid: string;
};

/** A figure's citation: opens the cited node's result; clicking again closes it. */
export const NodeCitationMarker: FC<Props> = ({
    nodeId,
    citationNumber,
    label,
    message,
    projectUuid,
    agentUuid,
}) => {
    const dispatch = useAiAgentStoreDispatch();
    const getUiString = useUiStrings();
    const preview = useAiAgentStoreSelector(selectPreview);
    const isOpen =
        preview?.type === 'queryPipeline' &&
        preview.messageUuid === message.uuid &&
        preview.nodeId === nodeId;

    const handleClick = () => {
        if (isOpen) {
            dispatch(clearPreview());
            return;
        }
        dispatch(
            setPreview({
                type: 'queryPipeline',
                nodeId,
                messageUuid: message.uuid,
                threadUuid: message.threadUuid,
                projectUuid,
                agentUuid,
            }),
        );
    };

    return (
        <UnstyledButton
            type="button"
            className={styles.marker}
            disabled={citationNumber === null}
            aria-pressed={isOpen}
            data-active={isOpen}
            aria-label={interpolateUiString(
                getUiString('aiAgent.nodeCitation.marker'),
                { label: label || citationNumber || '' },
            )}
            title={label}
            onClick={handleClick}
        >
            {citationNumber ?? '·'}
        </UnstyledButton>
    );
};
