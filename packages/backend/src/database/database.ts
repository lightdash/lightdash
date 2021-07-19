import knex from 'knex';
import * as knexfile from './knexfile';

const getKnexInstance = () => {
    const env = process.env.NODE_ENV || 'development';
    switch (env) {
        case 'production':
            return knexfile.production;
        case 'development':
        default:
            return knexfile.development;
    }
};

export default knex(getKnexInstance());
