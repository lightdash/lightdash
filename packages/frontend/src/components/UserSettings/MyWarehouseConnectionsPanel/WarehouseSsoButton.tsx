import { WarehouseTypes } from '@lightdash/common';
import { Button, Tooltip } from '@mantine-8/core';
import { type FC, type ReactNode } from 'react';
import { GOOGLE_LOGO } from '../../common/ThirdPartySignInButton/ssoProviderLogos';
import { getWarehouseIcon } from '../../ProjectConnection/ProjectConnectFlow/utils';

const getSsoButtonIcon = (warehouseType: WarehouseTypes): ReactNode =>
    warehouseType === WarehouseTypes.BIGQUERY ? (
        <img width={16} height={16} src={GOOGLE_LOGO} alt="Google logo" />
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
    const button = (
        <Button
            type="button"
            variant="default"
            color="gray"
            fullWidth
            disabled={disabled}
            loading={loading}
            leftSection={getSsoButtonIcon(warehouseType)}
            onClick={() => {
                openLoginPopup();
            }}
        >
            Sign in with {providerName}
        </Button>
    );

    if (disabled && disabledTooltip) {
        return (
            <Tooltip label={disabledTooltip} withArrow>
                <div>{button}</div>
            </Tooltip>
        );
    }

    return button;
};
