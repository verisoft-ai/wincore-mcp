// @ts-check

import { defineConfig } from 'eslint/config';
import appiumConfig from '@appium/eslint-config-appium-ts';

export default defineConfig(
  ...appiumConfig,
  {
    rules: {
      'import/no-unresolved': ['error', { ignore: ['^@modelcontextprotocol/'] }],
    },
  },
);
