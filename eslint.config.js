import vuetify from 'eslint-config-vuetify';

export default vuetify({
	ts: false,
	rules: {
		'@stylistic/indent': ['error', 'tab'],
		'@stylistic/semi': ['error', 'always'],
		'@stylistic/quotes': [
			'error',
			'single',
			{ avoidEscape: true, allowTemplateLiterals: 'always' },
		],
		'@stylistic/comma-dangle': ['error', 'always-multiline'],
		'@stylistic/object-curly-spacing': ['error', 'always'],
		'vue/script-indent': ['error', 'tab', { baseIndent: 1, switchCase: 1 }],
		'vue/html-indent': [
			'error',
			'tab',
			{
				attribute: 1,
				baseIndent: 1,
				closeBracket: 0,
				alignAttributesVertically: true,
				ignores: [],
			},
		],
	},
});
