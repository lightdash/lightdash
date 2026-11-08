import {
    type AiServiceAccountSlot,
    type AiServiceAccountTestResult,
    type AiServiceAccountWarehouse,
} from '@lightdash/common';
import { agentIdentityWarehouses } from './agentIdentityWarehouses';

export interface AiServiceAccountFormProps {
    projectUuid: string;
    onClose: () => void;
    onSaved: (
        slot: AiServiceAccountSlot,
        principal: string | null,
        verification?: AiServiceAccountTestResult | null,
    ) => void;
}

interface WarehouseAiServiceAccountFormProps extends AiServiceAccountFormProps {
    warehouseType: AiServiceAccountWarehouse;
}

export const AiServiceAccountForm = ({
    warehouseType,
    ...props
}: WarehouseAiServiceAccountFormProps) =>
    agentIdentityWarehouses[warehouseType].renderForm(props);
