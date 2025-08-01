import { FC } from 'react';
import { Modal, Group, Text, Stack, TextInput, Button } from '@mantine/core';

interface IntegrationModalProps {
  opened: boolean;
  onClose: () => void;
  selectedIntegration: string | null;
  shopUrl: string;
  setShopUrl: (url: string) => void;
  handleRefresh: () => void;
  handleConnect: () => void;
  integrations: { name: string; icon: string }[];
}

const IntegrationModal: FC<IntegrationModalProps> = ({
  opened,
  onClose,
  selectedIntegration,
  shopUrl,
  setShopUrl,
  handleRefresh,
  handleConnect,
  integrations,
}) => (
  <Modal
    opened={opened}
    onClose={onClose}
    title={
      <Group spacing="xs">
        <img
          src={integrations.find((i) => i.name === selectedIntegration)?.icon}
          alt={selectedIntegration || ''}
          style={{ width: 24, height: 24 }}
        />
        <Text fw={600} size="lg">
          Connect your {selectedIntegration} account
        </Text>
      </Group>
    }
    centered
    radius="md"
    size="lg"
  >
    <Stack spacing="lg" mt="md">
      <TextInput
        label="Store URL"
        placeholder={`e.g. myshop.${selectedIntegration}.com`}
        value={shopUrl}
        onChange={(e) => setShopUrl(e.currentTarget.value)}
        radius="md"
      />
      <Group position="right">
        <Button variant="default" onClick={handleRefresh}>
          Refresh Data
        </Button>
        <Button onClick={handleConnect}>Connect</Button>
      </Group>
    </Stack>
  </Modal>
);

export default IntegrationModal;
