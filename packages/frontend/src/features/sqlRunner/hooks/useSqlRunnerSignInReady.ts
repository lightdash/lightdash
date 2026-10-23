import { createContext, useContext } from 'react';

export const SqlRunnerSignInReadinessContext = createContext(true);
export const useSqlRunnerSignInReady = () =>
    useContext(SqlRunnerSignInReadinessContext);
