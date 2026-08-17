import { flue } from '@flue/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [flue()],
	server: { port: 8790, allowedHosts: ['gio.lightdash.dev'] },
});
