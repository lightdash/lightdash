import refresh from 'passport-oauth2-refresh';
import { googlePassportStrategy } from '../controllers/authentication';
import { databricksPassportStrategy } from '../controllers/authentication/strategies/databricksStrategy';
import { snowflakePassportStrategy } from '../controllers/authentication/strategies/snowflakeStrategy';

export const registerOAuthRefreshStrategies = (): void => {
    if (googlePassportStrategy) {
        refresh.use(googlePassportStrategy);
    }

    if (snowflakePassportStrategy) {
        refresh.use('snowflake', snowflakePassportStrategy);
    }

    if (databricksPassportStrategy) {
        refresh.use('databricks', databricksPassportStrategy);
    }
};
