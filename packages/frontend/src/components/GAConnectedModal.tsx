import { FC, useMemo, useState } from 'react';
import { Modal, Group, Text, Stack, Select, Button } from '@mantine/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { lightdashApi } from '../api';

type GaConnectedModalProps = {
  opened: boolean;
  onClose: () => void;
  connectionUuid: string; // from ?connection=... in your redirect
  iconUrl?: string;
  displayName?: string;
  config?: any;
};

type GaAccount = { name: string; displayName: string };           // "accounts/123"
type GaProperty = { name: string; displayName: string; parent?: string }; // "properties/151..."

const GaConnectedModal: FC<GaConnectedModalProps> = ({
  opened,
  onClose,
  connectionUuid,
  iconUrl,
  displayName,
}) => {
  const qc = useQueryClient();

  // 1) Accounts
  const {
    data: accountsData,
    isLoading: loadingAccounts,
    error: accountsError,
  } = useQuery({
    queryKey: ['ga-accounts', connectionUuid],
    enabled: opened && !!connectionUuid,
    queryFn: async () => {
      const res = await lightdashApi<any>({
        url: `/google-analytics/accounts?connection=${encodeURIComponent(connectionUuid)}`,
        method: 'GET',
      });
      console.log('Accounts response:', res);       
      return res.accounts ?? [];
    },
    staleTime: 60_000,
  });

  console.log('Accounts data:', accountsData);


  const [account, setAccount] = useState<string | null>(null); // "accounts/123"

  // 2) Properties for selected account
  const {
    data: propertiesData,
    isLoading: loadingProperties,
    error: propertiesError,
  } = useQuery({
    queryKey: ['ga-properties', connectionUuid, account],
    enabled: opened && !!connectionUuid && !!account,
    queryFn: async () => {
      const res = await lightdashApi<{ properties: any[] }>({
        url: `/google-analytics/properties?connection=${encodeURIComponent(
          connectionUuid,
        )}&account=${encodeURIComponent(account!)}`,
        method: 'GET',
      });
      return res.properties ?? [];
    },
    staleTime: 60_000,
  });

  console.log('Properties data:', propertiesData);

  const [property, setProperty] = useState<string | null>(null); // "properties/151..."
  const canSave = !!account && !!property;

  const accountOptions = useMemo(
    () => (accountsData ?? []).map((a: any) => ({ value: a.name, label: a.displayName || a.name })),
    [accountsData],
  );

  const propertyOptions = useMemo(
    () => (propertiesData ?? []).map((p) => ({ value: p.name, label: p.displayName || p.name })),
    [propertiesData],
  );

  const onSave = async () => {
    if (!canSave) return;
    await lightdashApi({
      url: '/google-analytics/select',
      method: 'POST',
      body: JSON.stringify({
        connectionUuid,
        account,     // e.g. "accounts/123"
        property,    // e.g. "properties/151581146"
      }),
    });
    // optional: refresh your connections list, clean the URL, navigate, etc.
    qc.invalidateQueries({ queryKey: ['connections'] }).catch(() => {});
    onClose();
    // window.history.replaceState({}, '', '/connections'); // if you want to clear ?connection=...
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      centered
      size="lg"
      title={
        <Group spacing="xs">
          {iconUrl && <img src={iconUrl} alt="" style={{ width: 24, height: 24 }} />}
          <Text fw={600} size="lg">Connect your {displayName ?? 'Google Analytics'} account</Text>
        </Group>
      }
    >
      <Stack spacing="md" mt="md">
        <Text>Select the Account and Property you want to use.</Text>

        <Select
          label="Account"
          placeholder={
            accountsError
              ? 'Failed to load accounts'
              : loadingAccounts
              ? 'Loading accounts…'
              : 'Choose an account'
          }
          data={accountOptions}
          searchable
          disabled={loadingAccounts || !!accountsError}
          value={account}
          onChange={(val) => {
            setAccount(val);
            setProperty(null); // reset property when account changes
          }}
          nothingFound="No accounts"
          radius="md"
        />

        <Select
          label="Property"
          placeholder={
            accountsError
              ? 'Fix accounts first'
              : !account
              ? 'Select an account first'
              : propertiesError
              ? 'Failed to load properties'
              : loadingProperties
              ? 'Loading properties…'
              : 'Choose a property'
          }
          data={propertyOptions}
          searchable
          disabled={!account || loadingProperties || !!propertiesError}
          value={property}
          onChange={setProperty}
          nothingFound={account ? 'No properties for this account' : undefined}
          radius="md"
        />

        <Group position="right">
          <Button variant="default" onClick={onClose}>Cancel</Button>
          <Button onClick={onSave} disabled={!canSave}>Save & Activate</Button>
        </Group>
      </Stack>
    </Modal>
  );
};

export default GaConnectedModal;
