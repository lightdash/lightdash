import { Box, Button, Popover, ScrollArea, Text } from '@mantine-8/core';
import { useIsLineClamped } from '../../../../hooks/useIsLineClamped';

type ClampedTextWithPopoverProps = {
    children: string;
    maxLines?: number;
    popoverWidth?: number;
};

const ClampedTextWithPopover = ({
    children,
    maxLines = 3,
    popoverWidth = 400,
}: ClampedTextWithPopoverProps) => {
    const { ref, isLineClamped } = useIsLineClamped(maxLines);

    return (
        <Box>
            <Text size="sm" lineClamp={maxLines} ref={ref}>
                {children}
            </Text>
            {isLineClamped && (
                <Popover
                    width={popoverWidth}
                    position="right"
                    withArrow
                    shadow="sm"
                >
                    <Popover.Target>
                        <Button
                            color="gray"
                            variant="transparent"
                            size="compact-xs"
                            ml={-8}
                        >
                            See more
                        </Button>
                    </Popover.Target>
                    <Popover.Dropdown>
                        <ScrollArea.Autosize
                            type="hover"
                            offsetScrollbars="y"
                            scrollbars="y"
                            mah={400}
                        >
                            <Text
                                size="sm"
                                style={{
                                    whiteSpace: 'pre-wrap',
                                }}
                            >
                                {children}
                            </Text>
                        </ScrollArea.Autosize>
                    </Popover.Dropdown>
                </Popover>
            )}
        </Box>
    );
};

export default ClampedTextWithPopover;
