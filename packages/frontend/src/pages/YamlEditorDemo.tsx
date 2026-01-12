import { Box, Button, Group, Paper, Text } from '@mantine/core';
import { useState } from 'react';
import { useParams } from 'react-router';
import ExploreYamlModal from '../components/Explorer/ExploreYamlModal';
import Page from '../components/common/Page/Page';

const MOCK_YAML = `# lightdash demo schema
version: 2
models:
  - name: clinic_visits
    description: >-
      Demo model for Monaco YAML editor preview
    columns:
      - name: visit_id
        tests:
          - unique
          - not_null
      - name: doctor_name
        meta:
          metrics:
            visit_count:
              type: count
      - name: visit_date
        description: Visit date
`;

const YamlEditorDemo = () => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const [opened, setOpened] = useState(true);

    return (
        <Page title="YAML Editor Demo" withLargeContent noContentPadding>
            <Box p="lg">
                <Paper p="md" radius="md" withBorder>
                    <Group justify="space-between" align="center">
                        <Text fw={600}>Monaco YAML editor (mock)</Text>
                        <Button
                            size="xs"
                            variant="light"
                            onClick={() => setOpened(true)}
                        >
                            Open editor
                        </Button>
                    </Group>
                    <Text size="xs" c="dimmed" mt={6}>
                        This demo bypasses git checks and uses mock schema
                        content.
                    </Text>
                </Paper>
            </Box>
            <ExploreYamlModal
                opened={opened}
                onClose={() => setOpened(false)}
                projectUuid={projectUuid ?? 'demo-project'}
                exploreName="mock_explore"
                mockContent={MOCK_YAML}
                mockFilePath="models/clinic.yml"
            />
        </Page>
    );
};

export default YamlEditorDemo;
