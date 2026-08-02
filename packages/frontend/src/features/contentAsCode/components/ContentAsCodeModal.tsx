import { type ApiError } from '@lightdash/common';
import { Button, Code, Stack, Text } from '@mantine-8/core';
import { useClipboard } from '@mantine-8/hooks';
import { IconCheck, IconCode, IconCopy } from '@tabler/icons-react';
import { type FC } from 'react';
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
};

const ContentAsCodeModal: FC<ContentAsCodeModalProps> = ({
    opened,
    onClose,
    resourceLabel,
    contentAsCode,
    warning,
}) => {
    const clipboard = useClipboard({ timeout: 1_000 });
    const { contentYaml, isLoading, error } = contentAsCode;

    return (
        <MantineModal
            opened={opened}
            onClose={onClose}
            title={`View ${resourceLabel} as code`}
            icon={IconCode}
            size="xl"
            cancelLabel="Close"
            actions={
                <Button
                    disabled={!contentYaml}
                    leftSection={
                        <MantineIcon
                            icon={clipboard.copied ? IconCheck : IconCopy}
                        />
                    }
                    onClick={() => contentYaml && clipboard.copy(contentYaml)}
                >
                    {clipboard.copied ? 'Copied' : 'Copy YAML'}
                </Button>
            }
        >
            {warning && <Callout variant="warning">{warning}</Callout>}

            {isLoading && (
                <EmptyStateLoader
                    mih={320}
                    title={`Generating ${resourceLabel} YAML`}
                />
            )}

            {error && <ErrorState error={error.error} hasMarginTop={false} />}

            {!isLoading && !error && !contentYaml && (
                <Callout variant="warning" title="Content not found">
                    Lightdash could not generate content as code for this{' '}
                    {resourceLabel}.
                </Callout>
            )}

            {contentYaml && (
                <Stack gap="xs">
                    <Text fz="sm" c="dimmed">
                        This YAML is compatible with Lightdash content as code.
                    </Text>
                    <Code block>{contentYaml}</Code>
                </Stack>
            )}
        </MantineModal>
    );
};

export default ContentAsCodeModal;
