import { createEslintConfig } from './src/kit/config/eslint.base.js';

export default createEslintConfig({ extraIgnores: ['e2e/screenshots/**'] });
