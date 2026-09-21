import { Box, Group, Title } from '@mantine/core';
import { type ReactNode } from 'react';
import { DASHBOARD_HEADER_HEIGHT } from '../../components/common/Dashboard/dashboard.constants';
import Page from '../../components/common/Page/Page';
import PageHeader from '../../components/common/Page/PageHeader';
import TruncatedText from '../../components/common/TruncatedText';
import pageStyles from '../../pages/Document.module.css';
import styles from './presentation/ReportPresentation.module.css';

const DocumentPageLayout = ({
    name,
    actions,
    children,
}: {
    name: string;
    actions: ReactNode;
    children: ReactNode;
}) => (
    <Box className={pageStyles.page}>
        <Page
            title={name}
            noContentPadding
            header={
                <PageHeader
                    cardProps={{ px: 0, py: 0, h: DASHBOARD_HEADER_HEIGHT }}
                >
                    <Group
                        className={styles.reportControls}
                        wrap="nowrap"
                        justify="space-between"
                    >
                        <Title order={6} flex={1} miw={0}>
                            <TruncatedText
                                maxWidth="100%"
                                inline
                                inherit
                                display="block"
                            >
                                {name}
                            </TruncatedText>
                        </Title>
                        {actions}
                    </Group>
                </PageHeader>
            }
        >
            {children}
        </Page>
    </Box>
);

export default DocumentPageLayout;
