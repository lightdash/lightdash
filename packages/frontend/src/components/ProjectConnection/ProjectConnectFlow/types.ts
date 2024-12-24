import { type WarehouseTypes } from '@lightdash/common';
import { type Icon } from '@tabler/icons-react';
import { type WarehouseTypeLabels } from './utils';

export enum OtherWarehouse {
    Other = 'Other',
}

export type WarehouseLabel =
    | {
          label: string;
          key: WarehouseTypes;
          iconType: 'image';
          image: string;
      }
    | {
          label: string;
          key: OtherWarehouse.Other;
          iconType: 'icon';
          Icon: Icon;
      };

export type SelectedWarehouse = typeof WarehouseTypeLabels[number]['key'];

export enum ConnectMethod {
    CLI = 'cli',
    MANUAL = 'manual',
}
