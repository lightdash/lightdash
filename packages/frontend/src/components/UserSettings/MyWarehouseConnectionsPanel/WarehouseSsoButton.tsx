import { WarehouseTypes } from '@lightdash/common';
import { Button, Tooltip } from '@mantine/core';
import { type FC, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { GOOGLE_LOGO } from '../../common/ThirdPartySignInButton/ssoProviderLogos';
import { getWarehouseIcon } from '../../ProjectConnection/ProjectConnectFlow/utils';

const getSsoButtonIcon = (
    warehouseType: WarehouseTypes,
    googleLogoAlt: string,
): ReactNode =>
    warehouseType === WarehouseTypes.BIGQUERY ? (
        <img width={16} height={16} src={GOOGLE_LOGO} alt={googleLogoAlt} />
    ) : (
        getWarehouseIcon(warehouseType, 'sm')
    );

export const WarehouseSsoButton: FC<{
    warehouseType: WarehouseTypes;
    providerName: string;
    disabled: boolean;
    disabledTooltip?: string;
    loading?: boolean;
    openLoginPopup: () => void;
}> = ({
    warehouseType,
    providerName,
    disabled,
    disabledTooltip,
    loading,
    openLoginPopup,
}) => {
    const { t } = useTranslation('userSettings');
    const button = (
        <Button
            type="button"
            variant="default"
            color="gray"
            fullWidth
            disabled={disabled}
            loading={loading}
            leftSection={getSsoButtonIcon(
                warehouseType,
                t(
                    'myWarehouseConnectionsPanel.warehouseSsoButton.googleLogoAlt',
                ),
            )}
            onClick={() => {
                openLoginPopup();
            }}
        >
            {t('myWarehouseConnectionsPanel.warehouseSsoButton.signInWith', {
                providerName,
            })}
        </Button>
    );

    if (disabled && disabledTooltip) {
        return (
            <Tooltip label={disabledTooltip}>
                <div>{button}</div>
            </Tooltip>
        );
    }

    return button;
};
