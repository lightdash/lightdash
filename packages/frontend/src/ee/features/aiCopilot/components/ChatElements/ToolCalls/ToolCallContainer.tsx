import { Box } from '@mantine-8/core';
import { IconSparkles, type TablerIconsProps } from '@tabler/icons-react';
import type { FC, JSX } from 'react';
import classes from './ToolCallContainer.module.css';
import { ToolCallPaper } from './ToolCallPaper';

type ToolCallContainerProps = {
    children: React.ReactNode;
    defaultOpened?: boolean;
    title: string;
    isStreaming?: boolean;
    enableIconAnimation?: boolean;
    icon?: (props: TablerIconsProps) => JSX.Element;
};

export const ToolCallContainer: FC<ToolCallContainerProps> = ({
    children,
    defaultOpened = true,
    title,
    isStreaming = false,
    enableIconAnimation = true,
    icon = IconSparkles,
}) => {
    return (
        <ToolCallPaper
            defaultOpened={defaultOpened}
            variant="dashed"
            icon={icon}
            iconClassName={
                isStreaming && enableIconAnimation
                    ? classes.streamingIcon
                    : undefined
            }
            title={
                isStreaming ? (
                    <Box component="span" className={classes.streamingTitle}>
                        {title}
                    </Box>
                ) : (
                    title
                )
            }
        >
            {children}
        </ToolCallPaper>
    );
};
