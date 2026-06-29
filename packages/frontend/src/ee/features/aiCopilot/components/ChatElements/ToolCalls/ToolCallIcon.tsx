import { type AiAgentToolName } from '@lightdash/common';
import { Box } from '@mantine-8/core';
import { useState, type CSSProperties, type FC } from 'react';
import MantineIcon from '../../../../../../components/common/MantineIcon';
import styles from './ToolCallIcon.module.css';
import { isActivityToolName } from './utils/activityToolNames';
import {
    getMcpToolDisplayMetadata,
    type McpDisplayServer,
} from './utils/mcpToolDisplay';
import { getToolIcon } from './utils/toolIcons';

type Props = {
    toolName: AiAgentToolName;
    size?: number;
    stroke?: number;
    className?: string;
    style?: CSSProperties;
    mcpServer?: McpDisplayServer;
    'data-live'?: 'true' | 'false';
    'data-status'?: string;
};

export const ToolCallIcon: FC<Props> = ({
    toolName,
    size = 13,
    stroke = 1.6,
    className,
    style,
    mcpServer,
    ...dataAttributes
}) => {
    const [failedIconUrl, setFailedIconUrl] = useState<string | null>(null);

    if (isActivityToolName(toolName)) {
        const Icon = getToolIcon(toolName);
        return (
            <MantineIcon
                icon={Icon}
                size={size}
                stroke={stroke}
                className={className}
                {...dataAttributes}
            />
        );
    }

    const displayMetadata = getMcpToolDisplayMetadata(toolName, mcpServer);
    const shouldShowFavicon =
        displayMetadata.iconUrl && displayMetadata.iconUrl !== failedIconUrl;

    return (
        <Box
            component="span"
            aria-hidden
            className={`${styles.mcpIcon} ${className ?? ''}`}
            style={style}
            data-provider={displayMetadata.kind}
            data-has-image={shouldShowFavicon ? 'true' : 'false'}
            {...dataAttributes}
        >
            {shouldShowFavicon ? (
                <Box
                    component="img"
                    src={displayMetadata.iconUrl!}
                    alt=""
                    className={styles.mcpFavicon}
                    onError={() => setFailedIconUrl(displayMetadata.iconUrl)}
                />
            ) : (
                displayMetadata.shortLabel
            )}
        </Box>
    );
};
