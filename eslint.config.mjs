// @ts-check
import js from '@eslint/js';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const bannedPackages = [
  'dayjs',
  'date-fns',
  'moment',
  'gsap',
  'graphql',
  'mongodb',
  'mongoose',
  'kafkajs',
  'amqplib',
  'minio',
  '@elastic/elasticsearch',
  'ws',
  'socket.io',
  'socket.io-client',
].map((name) => ({
  name,
  message: 'This package is excluded by the project stack (see CLAUDE.md).',
}));

const dateRestriction = {
  selector: "NewExpression[callee.name='Date'], CallExpression[callee.object.name='Date']",
  message: 'Use the Temporal helpers from @etkinlik/shared instead of Date.',
};

/** Security and stack rules shared by every file, including tests. */
const baseRestrictedSyntax = [
  {
    selector: 'AssignmentExpression[left.property.name=/^(innerHTML|outerHTML)$/]',
    message: 'innerHTML/outerHTML is forbidden; render user text as plain text.',
  },
  {
    selector: "CallExpression[callee.property.name='insertAdjacentHTML']",
    message: 'insertAdjacentHTML is forbidden.',
  },
  {
    selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
    message: 'dangerouslySetInnerHTML is forbidden.',
  },
  {
    selector: 'CallExpression[callee.property.name=/^\\$(queryRawUnsafe|executeRawUnsafe)$/]',
    message: 'Unsafe raw SQL is forbidden; use tagged $queryRaw / $executeRaw.',
  },
];
const restrictedSyntax = [...baseRestrictedSyntax, dateRestriction];

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      '**/playwright-report/**',
      '**/test-results/**',
      '**/dev-dist/**',
      '.devcontainer/**',
      'docs/kaynak/**',
      'design-system/**',
      'tools/semgrep/**',
      '.tmp/**',
      'apps/api/src/generated/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: { allowDefaultProject: ['eslint.config.mjs'] },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      eqeqeq: ['error', 'always'],
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/consistent-type-assertions': ['error', { assertionStyle: 'never' }],
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/require-await': 'error',
      '@typescript-eslint/return-await': ['error', 'always'],
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
      'no-restricted-imports': ['error', { paths: bannedPackages }],
      'no-restricted-syntax': ['error', ...restrictedSyntax],
    },
  },
  {
    files: ['apps/api/**/*.ts'],
    languageOptions: { globals: globals.node },
    rules: {
      // NestJS relies on class-based DI with empty module classes.
      '@typescript-eslint/no-extraneous-class': 'off',
      // Nest option types are declared as classes but are meant to be passed as plain objects.
      '@typescript-eslint/no-unsafe-class-instance-assignment': 'off',
    },
  },
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks, 'jsx-a11y': jsxA11y },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.flatConfigs.strict.rules,
    },
  },
  {
    files: ['**/*.{js,mjs,cjs}'],
    ...tseslint.configs.disableTypeChecked,
    languageOptions: { globals: globals.node },
  },
  {
    files: ['**/*.test.ts', '**/*.spec.ts', '**/test/**/*.ts', '**/e2e/**/*.ts'],
    rules: {
      '@typescript-eslint/consistent-type-assertions': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/unbound-method': 'off',
      // Tests talk to Prisma, whose DateTime fields take Date objects.
      'no-restricted-syntax': ['error', ...baseRestrictedSyntax],
    },
  },
);
