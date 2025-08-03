import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
    turbopack: {
        // Configure Turbopack to handle dynamic imports and Web Workers
        rules: {
            '*.worker.js': {
                loaders: ['worker-loader'],
                as: '*.worker.js',
            },
        },
    },
};

export default nextConfig;
