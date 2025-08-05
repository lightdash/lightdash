import { FC } from 'react';
import { Modal, Group, Text, Stack, TextInput, Button } from '@mantine/core';
import { Connection } from '@lightdash/common/dist/types/types/connections';

interface ConnectionsModalProps {
  opened: boolean;
  onClose: () => void;
  selectedConnection: Connection | null;
  handleRefresh: () => void;
  handleConnect: () => void;
  updateConnection: (newName: string) => void;
}

const ConnectionsModal: FC<ConnectionsModalProps> = ({
  opened,
  onClose,
  selectedConnection,
  handleRefresh,
  handleConnect,
  updateConnection
}) => (
  <Modal
    opened={opened}
    onClose={onClose}
    title={
      <Group spacing="xs">
        <img
          src={selectedConnection?.icon}
          alt={selectedConnection?.name || ''}
          style={{ width: 24, height: 24 }}
        />
        <Text fw={600} size="lg">
          Connect your {selectedConnection?.name} account
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
        placeholder={`e.g. myshop.myshopify.com`}
        value={selectedConnection?.name || ''}
       onChange={(e) => updateConnection(e.currentTarget.value)}
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

export default ConnectionsModal;
