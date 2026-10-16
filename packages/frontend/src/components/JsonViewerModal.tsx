import {
    Button,
    CopyButton,
    Group,
    ScrollArea,
    Stack,
    Tooltip,
    type ModalProps,
} from '@mantine/core';
import { IconCheck, IconCode, IconCopy } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import ReactJson from 'react-json-view';
import { useRjvTheme } from '../hooks/useRjvTheme';
import MantineIcon from './common/MantineIcon';
import MantineModal from './common/MantineModal';

type Props = Pick<ModalProps, 'opened' | 'onClose'> & {
    heading: string;
    jsonObject: Record<string, unknown>;
};

export const JsonViewerModal = ({
    heading,
    jsonObject,
    opened,
    onClose,
}: Props) => {
    const { t } = useTranslation('app');
    const theme = useRjvTheme();
    return (
        <MantineModal
            opened={opened}
            onClose={onClose}
            title={heading}
            icon={IconCode}
            cancelLabel={false}
        >
            <Stack>
                <ScrollArea.Autosize mah={500}>
                    <ReactJson
                        theme={theme}
                        enableClipboard={false}
                        src={jsonObject}
                    />
                </ScrollArea.Autosize>

                <Group justify="end">
                    <CopyButton
                        value={JSON.stringify(jsonObject)}
                        timeout={2000}
                    >
                        {({ copied, copy }) => (
                            <Tooltip
                                label={
                                    copied
                                        ? t('jsonViewer.copied')
                                        : t('actions.copy', { ns: 'common' })
                                }
                                position="right"
                            >
                                <Button
                                    color={copied ? 'teal' : 'gray'}
                                    onClick={copy}
                                    leftSection={
                                        <MantineIcon
                                            icon={copied ? IconCheck : IconCopy}
                                        />
                                    }
                                >
                                    {t('actions.copy', { ns: 'common' })}
                                </Button>
                            </Tooltip>
                        )}
                    </CopyButton>
                </Group>
            </Stack>
        </MantineModal>
    );
};
