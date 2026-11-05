import { ActionIcon, Divider, Group, Tooltip } from '@mantine/core';
import { IconMaximize, IconMinimize, IconX } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { useUiStrings } from '../../../../providers/Embed/useUiStrings';
import { useArtifactFocusContext } from '../AiAgentPageLayout/artifactFocus';
import styles from './AiArtifactPanel.module.css';

/** Hides the chat so the artifact gets the whole workspace; Escape restores it. */
const ArtifactFocusToggle: FC = () => {
    const focus = useArtifactFocusContext();
    const getUiString = useUiStrings();
    if (!focus) return null;
    const label = getUiString(
        focus.isFocused
            ? 'aiAgent.artifactPanel.collapse'
            : 'aiAgent.artifactPanel.expand',
    );
    return (
        <Tooltip
            label={
                focus.isFocused
                    ? getUiString('aiAgent.artifactPanel.collapseTooltip')
                    : label
            }
        >
            <ActionIcon
                size="sm"
                aria-label={label}
                aria-pressed={focus.isFocused}
                onClick={focus.toggle}
            >
                <MantineIcon
                    icon={focus.isFocused ? IconMinimize : IconMaximize}
                />
            </ActionIcon>
        </Tooltip>
    );
};

/** Expand and close, kept apart from the panel's content actions by a divider. */
export const ArtifactWindowControls: FC<{
    onClose: (() => void) | null;
    /** Draws the divider; off when nothing precedes the controls. */
    separated: boolean;
}> = ({ onClose, separated }) => (
    <Group gap={4} wrap="nowrap" className={styles.windowControls}>
        {separated && (
            <Divider orientation="vertical" className={styles.headDivider} />
        )}
        <ArtifactFocusToggle />
        {onClose && (
            <ActionIcon size="sm" onClick={onClose} aria-label="Close">
                <MantineIcon icon={IconX} />
            </ActionIcon>
        )}
    </Group>
);
