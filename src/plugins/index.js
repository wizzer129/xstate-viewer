import router from '../router';
import { createPinia } from 'pinia';
/**
 * plugins/index.js
 *
 * Automatically included in ./src/main.js
 */

// Plugins
import vuetify from './vuetify';

export function registerPlugins(app) {
	app.use(vuetify);
	app.use(createPinia());
	app.use(router);
}
