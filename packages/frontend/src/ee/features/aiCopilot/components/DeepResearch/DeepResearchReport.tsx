import {
    Box,
    Button,
    Drawer,
    Group,
    ScrollArea,
    Stack,
    Text,
    Title,
} from '@mantine-8/core';
import { IconArrowLeft } from '@tabler/icons-react';
import { NAVBAR_HEIGHT } from '../../../../../components/common/Page/constants';
import { type DeepResearchRunView } from '../../deepResearch/types';
import { DeepResearchMarkdownReport } from './DeepResearchMarkdownReport';
import styles from './DeepResearchReport.module.css';

type Props = {
    run: DeepResearchRunView;
    opened: boolean;
    onClose: () => void;
};

export const DeepResearchReport = ({ run, opened, onClose }: Props) => {
    if (!run.resultMarkdown) {
        return null;
    }

    return (
        <Drawer
            opened={opened}
            onClose={onClose}
            title={
                <Group className={styles.reportControls} wrap="nowrap">
                    <Text className={styles.visuallyHidden}>Deep research</Text>
                    <Button
                        variant="subtle"
                        color="gray"
                        radius="xl"
                        size="xs"
                        leftSection={<IconArrowLeft size={14} />}
                        onClick={onClose}
                    >
                        Back to chat
                    </Button>
                </Group>
            }
            withCloseButton={false}
            position="right"
            size="100%"
            padding={0}
            classNames={{
                inner: styles.drawerInner,
                overlay: styles.drawerOverlay,
                header: styles.drawerHeader,
                title: styles.drawerTitle,
            }}
            __vars={{ '--drawer-top-offset': `${NAVBAR_HEIGHT}px` }}
        >
            <ScrollArea className={styles.reportScroll}>
                <Box component="article" className={styles.report}>
                    <Stack gap="xl">
                        <Box component="header" className={styles.reportHeader}>
                            <Text className={styles.eyebrow}>
                                Deep research
                            </Text>
                            <Title order={1} className={styles.reportTitle}>
                                {run.question}
                            </Title>
                        </Box>
                        <DeepResearchMarkdownReport
                            markdown={run.resultMarkdown}
                            chartData={run.resultChartData}
                            projectUuid={run.projectUuid}
                            runUuid={run.uuid}
                        />
                    </Stack>
                </Box>
            </ScrollArea>
        </Drawer>
    );
};
