import { OtherWarehouse, WarehouseTypes } from '@lightdash/common';
import { Icon } from '@tabler/icons-react';

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
