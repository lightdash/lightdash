import {
    Account,
    Project,
    ServiceAccount,
    SessionUser,
} from '@lightdash/common';
import { ClientRepository } from '../clients/ClientRepository';
import { ServiceRepository } from '../services/ServiceRepository';

declare global {
    namespace Express {
        interface Request {
            services: ServiceRepository;
            serviceAccount?: Pick<ServiceAccount, 'organizationUuid'>;
            project?: Pick<Project, 'projectUuid'>;
            /**
             * @deprecated Clients should be used inside services. This will be removed soon.
             */
            clients: ClientRepository;
            account?: Account;
            rawBody?: Buffer;
        }

        interface User extends SessionUser {}
    }
}
