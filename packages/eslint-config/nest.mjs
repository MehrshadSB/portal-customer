import globals from 'globals';
import { baseConfig } from './base.mjs';

export const nestConfig = [
  ...baseConfig,
  {
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'off',
    },
  },
];
