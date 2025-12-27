import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-plugin-prettier';
import { defineConfig, globalIgnores } from 'eslint/config';

export default defineConfig([
    globalIgnores(['dist', 'node_modules']),
    {
        files: ['**/*.{ts,js}'],
        extends: [js.configs.recommended, tseslint.configs.recommended],
        plugins: {
            prettier,
        },
        rules: {
            'prettier/prettier': 'error',
            '@typescript-eslint/no-unused-vars': [
                'error',
                {
                    argsIgnorePattern: '^_',
                    varsIgnorePattern: '^_',
                    caughtErrorsIgnorePattern: '^_',
                },
            ],
        },
        languageOptions: {
            ecmaVersion: 2020,
            sourceType: 'module',
        },
    },
]);
