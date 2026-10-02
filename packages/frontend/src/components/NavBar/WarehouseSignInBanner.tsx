import {
    assertUnreachable,
    FeatureFlags,
    PersonSignInProvider,
    type WarehouseSignInStatus,
} from '@lightdash/common';
import { Button, Center, Group, Text } from '@mantine/core';
import { useQueryClient } from '@tanstack/react-query';
import { useGoogleLoginPopup } from '../../hooks/gdrive/useGdrive';
import { useDatabricksLoginPopup } from '../../hooks/useDatabricks';
import { useServerFeatureFlag } from '../../hooks/useServerOrClientFeatureFlag';
import { useSnowflakeLoginPopup } from '../../hooks/useSnowflake';
import { warehouseSignInStatusQueryKey } from '../../hooks/useWarehouseSignInStatus';
import { BANNER_HEIGHT } from '../common/Page/constants';
import classes from './TrialWarningBanner.module.css';

const WAREHOUSE_SIGN_IN_RECONNECTED = 'warehouse-sign-in-reconnected';

export const WarehouseSignInBanner = ({
    projectUuid,
    status,
}: {
    projectUuid: string;
    status: WarehouseSignInStatus;
}) => {
    const queryClient = useQueryClient();
    const onLogin = async () => {
        queryClient.removeQueries({
            queryKey: warehouseSignInStatusQueryKey(projectUuid),
        });
        await queryClient.invalidateQueries();
        window.dispatchEvent(
            new CustomEvent(WAREHOUSE_SIGN_IN_RECONNECTED, {
                detail: projectUuid,
            }),
        );
    };
    const google = useGoogleLoginPopup('bigquery', () => {
        void onLogin();
    });
    const snowflake = useSnowflakeLoginPopup({ onLogin });
    const databricks = useDatabricksLoginPopup({ projectUuid, onLogin });
    const expiredStateFlag = useServerFeatureFlag(
        FeatureFlags.ExpiredSignInState,
    );
    if (!status.signIn?.expired) return null;
    if (
        status.signIn.provider === 'aws' &&
        expiredStateFlag.data?.enabled !== true
    )
        return null;

    const { provider } = status.signIn;
    const reconnect = () => {
        switch (provider) {
            case PersonSignInProvider.GOOGLE:
                google.mutate();
                return;
            case PersonSignInProvider.SNOWFLAKE:
                snowflake.mutate();
                return;
            case PersonSignInProvider.DATABRICKS:
                databricks.mutate();
                return;
            case 'aws':
                window.dispatchEvent(
                    new CustomEvent('warehouse-sign-in-requested', {
                        detail: projectUuid,
                    }),
                );
                return;
            default:
                assertUnreachable(provider, 'Unknown sign-in provider');
        }
    };
    const label = (() => {
        switch (provider) {
            case PersonSignInProvider.GOOGLE:
                return 'BigQuery';
            case PersonSignInProvider.SNOWFLAKE:
                return 'Snowflake';
            case PersonSignInProvider.DATABRICKS:
                return 'Databricks';
            case 'aws':
                return 'Redshift';
            default:
                return assertUnreachable(provider, 'Unknown sign-in provider');
        }
    })();
    return (
        <Center
            pos="fixed"
            top={0}
            w="100%"
            h={BANNER_HEIGHT}
            px="md"
            bg="yellow.7"
            className={classes.banner}
        >
            <Group gap="sm" wrap="nowrap">
                <Text c="gray.9" size="sm" fw={600}>
                    Your {label} sign-in has expired.
                </Text>
                <Button
                    variant="outline"
                    color="dark"
                    size="xs"
                    onClick={reconnect}
                    loading={
                        google.isLoading ||
                        snowflake.isLoading ||
                        databricks.isLoading
                    }
                >
                    Reconnect
                </Button>
            </Group>
        </Center>
    );
};
