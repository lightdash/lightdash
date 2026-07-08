import { WarehouseTypes } from '@lightdash/common';
import { Button, Tooltip } from '@mantine-8/core';
import { type FC, type ReactNode } from 'react';
import { getWarehouseIcon } from '../../ProjectConnection/ProjectConnectFlow/utils';

const GOOGLE_LOGO_SRC =
    'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTgiIGhlaWdodD0iMTgiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZyI+PGcgZmlsbD0ibm9uZSIgZmlsbC1ydWxlPSJldmVub2RkIj48cGF0aCBkPSJNMTcuNiA5LjJsLS4xLTEuOEg5djMuNGg0LjhDMTMuNiAxMiAxMyAxMyAxMiAxMy42djIuMmgzYTguOCA4LjggMCAwIDAgMi42LTYuNnoiIGZpbGw9IiM0Mjg1RjQiIGZpbGwtcnVsZT0ibm9uemVybyIvPjxwYXRoIGQ9Ik05IDE4YzIuNCAwIDQuNS0uOCA2LTIuMmwtMy0yLjJhNS40IDUuNCAwIDAgMS04LTIuOUgxVjEzYTkgOSAwIDAgMCA4IDV6IiBmaWxsPSIjMzRBODUzIiBmaWxsLXJ1bGU9Im5vbnplcm8iLz48cGF0aCBkPSJNNCAxMC43YTUuNCA1LjQgMCAwIDEgMC0zLjRWNUgxYTkgOSAwIDAgMCAwIDhsMy0yLjN6IiBmaWxsPSIjRkJCQzA1IiBmaWxsLXJ1bGU9Im5vbnplcm8iLz48cGF0aCBkPSJNOSAzLjZjMS4zIDAgMi41LjQgMy40IDEuM0wxNSAyLjNBOSA5IDAgMCAwIDEgNWwzIDIuNGE1LjQgNS40IDAgMCAxIDUtMy43eiIgZmlsbD0iI0VBNDMzNSIgZmlsbC1ydWxlPSJub256ZXJvIi8+PHBhdGggZD0iTTAgMGgxOHYxOEgweiIvPjwvZz48L3N2Zz4=';

const getSsoButtonIcon = (warehouseType: WarehouseTypes): ReactNode =>
    warehouseType === WarehouseTypes.BIGQUERY ? (
        <img width={16} height={16} src={GOOGLE_LOGO_SRC} alt="Google logo" />
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
