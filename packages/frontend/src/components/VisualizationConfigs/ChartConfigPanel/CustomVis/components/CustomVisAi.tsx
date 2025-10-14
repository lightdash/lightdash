import { type ItemsMap } from '@lightdash/common';
import { Button, Group, Popover, Stack, Textarea } from '@mantine-8/core';
import { IconSparkles } from '@tabler/icons-react';
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router';
import MantineIcon from '../../../../common/MantineIcon';
import { useCustomVis } from '../hooks/useCustomVisAi';

export const GenerateVisWithAi = ({
    itemsMap,
    sampleResults,
    editorConfig,
    setEditorConfig,
}: {
    itemsMap: ItemsMap | undefined;
    sampleResults: {
        [k: string]: unknown;
    }[];
    editorConfig: string;
    setEditorConfig: (config: string) => void;
}) => {
    const { projectUuid } = useParams<{
        projectUuid: string;
    }>();
    const [prompt, setPrompt] = useState('');

    const { mutate: getCustomVis, data, isLoading } = useCustomVis(projectUuid);

    useEffect(() => {
        if (data) setEditorConfig(data);
    }, [data, setEditorConfig]);

    const handleSubmit = useCallback(() => {
        if (isLoading) return;

        if (prompt && projectUuid)
            getCustomVis({
                prompt,
                itemsMap,
                sampleResults,
                currentVizConfig: editorConfig,
            });
    }, [
        getCustomVis,
        prompt,
        projectUuid,
        isLoading,
        itemsMap,
        sampleResults,
        editorConfig,
    ]);

    return (
        <Popover
            width="400px"
            position="bottom"
            withArrow
            shadow="md"
            withinPortal
        >
            <Popover.Target>
                <Button
                    size="compact-sm"
                    variant="default"
                    fz="xs"
                    leftSection={<MantineIcon icon={IconSparkles} />}
                    styles={{
                        root: {
                            borderTopLeftRadius: 0,
                            borderBottomLeftRadius: 0,
                            borderLeftColor: 'transparent',
                        },
                    }}
                >
                    AI
                </Button>
            </Popover.Target>

            <Popover.Dropdown>
                <Stack gap="xs">
                    <Textarea
                        placeholder="Create a heatmap with detailed tooltips and clear values for fast insights"
                        autosize
                        radius="md"
                        autoFocus={true}
                        minRows={1}
                        maxRows={20}
                        onChange={(event) => {
                            setPrompt(event.currentTarget.value);
                        }}
                        onKeyDown={(event) => {
                            if (event.key === 'Enter' && !event.shiftKey) {
                                event.preventDefault();
                                handleSubmit();
                            }
                        }}
                    />

                    <Group justify="flex-end">
                        <Button
                            type="submit"
                            size="compact-sm"
                            loading={isLoading}
                            onClick={handleSubmit}
                        >
                            {isLoading ? 'Generating...' : 'Generate'}
                        </Button>
                    </Group>
                </Stack>
            </Popover.Dropdown>
        </Popover>
    );
};
