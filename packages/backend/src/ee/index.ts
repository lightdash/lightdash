import { AppArguments } from '../App';

type EnterpriseAppArguments = Pick<
    AppArguments,
    | 'schedulerWorkerFactory'
    | 'clientProviders'
    | 'serviceProviders'
    | 'modelProviders'
    | 'customExpressMiddlewares'
>;

export async function getEnterpriseAppArguments(): Promise<EnterpriseAppArguments> {
    return {};
}
