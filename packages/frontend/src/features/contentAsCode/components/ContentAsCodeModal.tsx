import { type ApiError } from '@lightdash/common';
import { Button, Code, SegmentedControl, Stack, Text } from '@mantine/core';
import { useClipboard } from '@mantine/hooks';
import {
    IconCheck,
    IconCode,
    IconCopy,
    IconDownload,
} from '@tabler/icons-react';
import { useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import Callout from '../../../components/common/Callout';
import EmptyStateLoader from '../../../components/common/EmptyStateLoader';
import ErrorState from '../../../components/common/ErrorState';
import MantineIcon from '../../../components/common/MantineIcon';
import MantineModal from '../../../components/common/MantineModal';

type ContentAsCodeModalProps = {
    opened: boolean;
    onClose: () => void;
    resourceLabel: string;
    contentAsCode: {
        contentYaml: string | undefined;
        isLoading: boolean;
        error: ApiError | null;
    };
    warning?: string;
    contentJson?: string;
    downloadFileName?: string;
};

const ContentAsCodeModal: FC<ContentAsCodeModalProps> = ({
    opened,
    onClose,
    resourceLabel,
    contentAsCode,
    warning,
    contentJson,
    downloadFileName,
}) => {
    const { t } = useTranslation('contentAsCode');
    const clipboard = useClipboard({ timeout: 1_000 });
    const [format, setFormat] = useState('yaml');
    const { contentYaml, isLoading, error } = contentAsCode;
    const content =
        !isLoading && !error
            ? format === 'json'
                ? contentJson
                : contentYaml
            : undefined;
    const formatLabel = format.toUpperCase();
    const handleDownload = () => {
        if (!content || !downloadFileName) {
            return;
        }
        const blob = new Blob([content], {
            type: format === 'json' ? 'application/json' : 'application/yaml',
        });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `${downloadFileName}.${format}`;
        anchor.click();
        URL.revokeObjectURL(url);
    };

    return (
        <MantineModal
            opened={opened}
            onClose={onClose}
            title={t('asCodeModal.title', { resource: resourceLabel })}
            icon={IconCode}
            size="xl"
            cancelLabel={t('actions.close', { ns: 'common' })}
            actions={
                <>
                    {downloadFileName && (
                        <Button
                            variant="default"
                            disabled={!content}
                            leftSection={<MantineIcon icon={IconDownload} />}
                            onClick={handleDownload}
                        >
                            {t('asCodeModal.download', { format: formatLabel })}
                        </Button>
                    )}
                    <Button
                        disabled={!content}
                        leftSection={
                            <MantineIcon
                                icon={clipboard.copied ? IconCheck : IconCopy}
                            />
                        }
                        onClick={() => content && clipboard.copy(content)}
                    >
                        {clipboard.copied
                            ? t('asCodeModal.copied')
                            : t('asCodeModal.copy', { format: formatLabel })}
                    </Button>
                </>
            }
        >
            {warning && <Callout variant="warning">{warning}</Callout>}

            {isLoading && (
                <EmptyStateLoader
                    mih={320}
                    title={t('asCodeModal.generating', {
                        resource: resourceLabel,
                    })}
                />
            )}

            {error && <ErrorState error={error.error} hasMarginTop={false} />}

            {!isLoading && !error && !contentYaml && (
                <Callout
                    variant="warning"
                    title={t('asCodeModal.notFoundTitle')}
                >
                    {t('asCodeModal.notFoundDescription', {
                        resource: resourceLabel,
                    })}
                </Callout>
            )}

            {content && (
                <Stack gap="xs">
                    {contentJson && (
                        <SegmentedControl
                            aria-label={t('asCodeModal.formatAriaLabel')}
                            value={format}
                            onChange={(value) => {
                                setFormat(value);
                                clipboard.reset();
                            }}
                            data={[
                                { label: 'YAML', value: 'yaml' },
                                { label: 'JSON', value: 'json' },
                            ]}
                        />
                    )}
                    <Text fz="sm" c="dimmed">
                        {t('asCodeModal.compatible', { format: formatLabel })}
                    </Text>
                    <Code block>{content}</Code>
                </Stack>
            )}
        </MantineModal>
    );
};

export default ContentAsCodeModal;
