// ConnectionsModal.tsx
import { FC } from 'react';
import { Modal, Group, Text, Stack, TextInput, Button } from '@mantine/core';

interface ConnectionsModalProps {
  opened: boolean;
  onClose: () => void;
  shopUrl: string;
  setShopUrl: (v: string) => void;
  handleRefresh: () => void;
  handleConnect: (config: any) => void;
  config: Record<string, any>;
}

const ConnectionsModal: FC<ConnectionsModalProps> = ({
  opened,
  onClose,
  shopUrl,
  setShopUrl,
  handleRefresh,
  handleConnect,
  config,
}) => {
  const isValidShop = (s: string) => true
  //  /^[a-z0-9][a-z0-9-]*\.(myshopify\.com)$/i.test(s.trim());

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        <Group spacing="xs">
          <img
            src={config.icon || '/logos/default.svg'}
            alt={config.name || 'Connection Icon'}
            style={{ width: 24, height: 24 }}
          />
          <Text fw={600} size="lg">
            Connect your {config.name} account
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
          placeholder="e.g. myshop.myshopify.com"
          value={shopUrl}
          onChange={(e) => setShopUrl(e.currentTarget.value)}
          radius="md"
        />
        <Group position="right">
          <Button variant="default" onClick={handleRefresh} disabled={!isValidShop(shopUrl)}>
            Refresh Data
          </Button>
          <Button onClick={() => handleConnect( config )} disabled={!isValidShop(shopUrl)}>
            Connect
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
};

export default ConnectionsModal;
