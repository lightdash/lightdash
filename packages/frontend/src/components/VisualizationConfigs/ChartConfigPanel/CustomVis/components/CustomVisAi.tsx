import { type ItemsMap } from '@lightdash/common';
import { Button, Popover, Textarea } from '@mantine/core';
import { IconSparkles } from '@tabler/icons-react';
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router';
import MantineIcon from '../../../../common/MantineIcon';
import { useCustomVis } from '../hooks/useCustomVisAi';

export const GenerateVizWithAi = ({
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
                    compact
                    variant="default"
                    fz="xs"
                    leftIcon={<MantineIcon icon={IconSparkles} />}
                >
                    AI
                </Button>
            </Popover.Target>

            <Popover.Dropdown>
                <Textarea
                    placeholder="Create a heatmap with detailed tooltips and clear values for fast insights"
                    autosize
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

                <Button
                    mt="sm"
                    size="xs"
                    type="submit"
                    disabled={isLoading}
                    onClick={handleSubmit}
                >
                    {isLoading ? 'Generating...' : 'Generate'}
                </Button>
            </Popover.Dropdown>
        </Popover>
    );
};
