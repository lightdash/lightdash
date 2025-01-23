import App from './App';
import { lightdashConfig } from './config/lightdashConfig';
import knexConfig from './knexfile';

const test = () => {
    console.log('alalala');
    return Promise.resolve(1);
};

const test2 = async () => {
    console.log('alalala2');

    try {
        return await test();
    } catch (error) {
        console.error(error);
        return 2;
    }
};

const app = new App({
    lightdashConfig,
    port: process.env.PORT || 8080,
    environment:
        process.env.NODE_ENV === 'development' ? 'development' : 'production',
    knexConfig,
});

test2().then(console.log).catch(console.error);

export default app;
