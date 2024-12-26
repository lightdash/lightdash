import App from './App';
import { lightdashConfig } from './config/lightdashConfig';
import knexConfig from './knexfile';

const app = new App({
    lightdashConfig,
    port: process.env.PORT || 8080,
    environment:
        process.env.NODE_ENV === 'development' ? 'development' : 'production',
    knexConfig,
});

export default app;
