import {
    interpolateUiString,
    type AiAgentMessageAssistant,
} from '@lightdash/common';
import { UnstyledButton } from '@mantine/core';
import { type FC, type ReactNode } from 'react';
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
import styles from './NodeCitationLink.module.css';

type Props = {
    nodeId: string;
    figure: string;
    nodeTitle: string | null;
    children: ReactNode;
    message: AiAgentMessageAssistant;
    projectUuid: string;
    agentUuid: string;
};

export const NodeCitationLink: FC<Props> = ({
    nodeId,
    figure,
    nodeTitle,
    children,
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
            className={styles.link}
            aria-pressed={isOpen}
            data-active={isOpen}
            aria-label={interpolateUiString(
                getUiString('aiAgent.nodeCitation.open'),
                { figure },
            )}
            title={nodeTitle ?? getUiString('aiAgent.nodeCitation.untitled')}
            onClick={handleClick}
        >
            {children}
        </UnstyledButton>
    );
};
