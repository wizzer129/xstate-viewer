import { fileURLToPath, URL } from 'node:url';
import Vue from '@vitejs/plugin-vue';
import Fonts from 'unplugin-fonts/vite';
import { defineConfig } from 'vite';
import Vuetify, { transformAssetUrls } from 'vite-plugin-vuetify';

// https://vitejs.dev/config/
export default defineConfig({
	plugins: [
		Vue({
			template: { transformAssetUrls },
		}),
		// https://github.com/vuetifyjs/vuetify-loader/tree/master/packages/vite-plugin#readme
		Vuetify({
			autoImport: true,
			styles: {
				configFile: 'src/styles/settings.scss',
			},
		}),
		Fonts({
			fontsource: {
				families: [
					{
						name: 'Roboto',
						weights: [100, 300, 400, 500, 700, 900],
						styles: ['normal', 'italic'],
					},
				],
			},
		}),
	],
	css: {
		preprocessorOptions: {
			less: {
				javascriptEnabled: true,
			},
		},
	},
	define: { 'process.env': {} },
	optimizeDeps: {
		dedupe: [
			'@codemirror/state',
			'@codemirror/view',
			'@codemirror/language',
			'@codemirror/commands',
			'@codemirror/lang-javascript',
			'@codemirror/lang-json',
			'@codemirror/theme-one-dark',
			'codemirror',
		],
	},
	resolve: {
		alias: {
			'@': fileURLToPath(new URL('src', import.meta.url)),
		},
		extensions: ['.js', '.json', '.jsx', '.mjs', '.vue'],
		dedupe: [
			'@codemirror/state',
			'@codemirror/view',
			'@codemirror/language',
			'@codemirror/commands',
			'@codemirror/lang-javascript',
			'@codemirror/lang-json',
			'@codemirror/theme-one-dark',
		],
	},
	server: {
		port: 3000,
	},
});
