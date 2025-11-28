import {
    ActionIcon,
    Box,
    CopyButton,
    Modal,
    Stack,
    Title,
    Tooltip,
} from '@mantine/core';
import { type ModalRootProps } from '@mantine/core/lib/Modal/ModalRoot/ModalRoot';
import { IconCheck, IconCopy } from '@tabler/icons-react';
import ReactJson from 'react-json-view';
import { useRjvTheme } from '../hooks/useRjvTheme';
import MantineIcon from './common/MantineIcon';

type Props = ModalRootProps & {
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
        <Modal
            opened={opened}
            onClose={onClose}
            title={<Title order={4}>{heading}</Title>}
        >
            <Stack>
                <Box
                    sx={{
                        overflow: 'auto',
                    }}
                >
                    <ReactJson
                        theme={theme}
                        enableClipboard={false}
                        src={jsonObject}
                    />
                </Box>

                <CopyButton value={JSON.stringify(jsonObject)} timeout={2000}>
                    {({ copied, copy }) => (
                        <Tooltip
                            label={copied ? 'Copied' : 'Copy'}
                            withArrow
                            position="right"
                        >
                            <ActionIcon
                                sx={{ alignSelf: 'end' }}
                                color={copied ? 'teal' : 'gray'}
                                onClick={copy}
                            >
                                <MantineIcon
                                    icon={copied ? IconCheck : IconCopy}
                                />
                            </ActionIcon>
                        </Tooltip>
                    )}
                </CopyButton>
            </Stack>
        </Modal>
    );
};
