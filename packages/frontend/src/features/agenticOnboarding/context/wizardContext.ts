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
    // Moves the just-created onboarding project onto the project-scoped connect
    // route so a refresh resumes instead of redirecting home. The account joins
    // warehouse/method in the query string (refresh-safe); navigation state
    // carries a one-shot justCreated flag the connect screen consumes and scrubs.
    goToProjectConnect: (projectUuid: string, account: string | null) => void;
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
