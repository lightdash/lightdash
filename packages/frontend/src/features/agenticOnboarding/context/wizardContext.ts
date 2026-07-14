import {
    type OnboardingStepType,
    type WarehouseTypes,
} from '@lightdash/common';
import { createContext, useContext } from 'react';
import { type ConnectMethodId } from '../utils/methodRegistry';

export type OnboardingWizardContextValue = {
    step: OnboardingStepType;
    warehouse: WarehouseTypes | null;
    method: ConnectMethodId | null;
    projectUuid: string | null;
    siteUrl: string;
    version: string;
    demoDestination: string;
    selectWarehouse: (warehouse: WarehouseTypes) => void;
    selectMethod: (method: ConnectMethodId) => void;
    clearMethod: () => void;
    clearWarehouse: () => void;
    goToProjectStep: (projectUuid: string, step: OnboardingStepType) => void;
};

const OnboardingWizardContext =
    createContext<OnboardingWizardContextValue | null>(null);

export default OnboardingWizardContext;

export const useOnboardingWizard = (): OnboardingWizardContextValue => {
    const ctx = useContext(OnboardingWizardContext);
    if (!ctx) {
        throw new Error(
            'useOnboardingWizard must be used within an OnboardingWizardProvider',
        );
    }
    return ctx;
};
