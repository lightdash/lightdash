import { Stack, Text } from '@mantine/core';
import { IconGitCompare } from '@tabler/icons-react';
import { type FC } from 'react';
import CodeBlock from '../../../components/common/CodeBlock/CodeBlock';
import MantineModal from '../../../components/common/MantineModal';
import { type ContentAsCodeSyncItem } from '../types';
import { getContentAsCodeTypeLabel } from '../utils/contentAsCodeTypeLabel';
import { dumpContentAsCodeDocument } from '../utils/dumpContentAsCodeDocument';
import classes from './ContentAsCodeSyncStatusPanel.module.css';

type ContentAsCodeSyncDiffModalProps = {
    item: ContentAsCodeSyncItem | null;
    opened: boolean;
    onClose: () => void;
};

const ContentAsCodeSyncDiffModal: FC<ContentAsCodeSyncDiffModalProps> = ({
    item,
    opened,
    onClose,
}) => {
    if (!item) {
        return null;
    }

    return (
        <MantineModal
            opened={opened}
            onClose={onClose}
            icon={IconGitCompare}
            title={item.slug}
            subtitle={`${getContentAsCodeTypeLabel(item.contentType)} · last applied vs current`}
            size="xl"
            cancelLabel="Close"
        >
            <div className={classes.diffColumns}>
                <Stack gap="xs">
                    <Text fz="sm" c="ldGray.6">
                        Last applied
                    </Text>
                    <CodeBlock
                        language="yaml"
                        code={
                            dumpContentAsCodeDocument(item.snapshot) ||
                            'No last-applied snapshot'
                        }
                    />
                </Stack>
                <Stack gap="xs">
                    <Text fz="sm" c="ldGray.6">
                        Current
                    </Text>
                    <CodeBlock
                        language="yaml"
                        code={
                            dumpContentAsCodeDocument(item.current) ||
                            'No current document'
                        }
                    />
                </Stack>
            </div>
        </MantineModal>
    );
};

export default ContentAsCodeSyncDiffModal;
