import { type ItemsMap } from '@lightdash/common';
import { Button, Textarea, Popover } from '@mantine/core';
import { IconSparkles } from '@tabler/icons-react';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useProjectUuid } from '../../../../../hooks/useProjectUuid';
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
    const { t } = useTranslation('vizConfig');
    const projectUuid = useProjectUuid();
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
        <Popover width="400px" position="bottom" withArrow>
            <Popover.Target>
                <Button
                    size="compact-sm"
                    variant="default"
                    fz="xs"
                    leftSection={<MantineIcon icon={IconSparkles} />}
                >
                    {t('customVis.ai')}
                </Button>
            </Popover.Target>

            <Popover.Dropdown>
                <Textarea
                    placeholder={t('customVis.aiPlaceholder')}
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
                    {isLoading
                        ? t('customVis.generating')
                        : t('customVis.generate')}
                </Button>
            </Popover.Dropdown>
        </Popover>
    );
};
