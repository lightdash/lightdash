import {
    Button,
    CopyButton,
    Group,
    ScrollArea,
    Stack,
    Tooltip,
    type ModalProps,
} from '@mantine-8/core';
import { IconCheck, IconCode, IconCopy } from '@tabler/icons-react';
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
                                label={copied ? 'Copied' : 'Copy'}
                                withArrow
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
                                    Copy
                                </Button>
                            </Tooltip>
                        )}
                    </CopyButton>
                </Group>
            </Stack>
        </MantineModal>
    );
};
