const path = require('node:path');
const eslint = require('@eslint/js');
const tseslint = require('typescript-eslint');

const crossModuleInfrastructureRule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow direct imports between module infrastructure layers',
    },
    schema: [],
    messages: {
      crossModuleInfrastructure:
        'Infrastructure for module "{{targetModule}}" must not import infrastructure from module "{{sourceModule}}". Wire modules together in src/composition-root.ts.',
    },
  },
  create(context) {
    const filename = path.resolve(context.filename).replaceAll('\\', '/');
    const targetMatch = filename.match(/\/src\/modules\/([^/]+)\/infrastructure(?:\/|$)/);

    if (!targetMatch) return {};

    function checkSource(node) {
      if (!node.source || typeof node.source.value !== 'string') return;

      const specifier = node.source.value;
      let resolved;
      if (specifier.startsWith('.')) {
        resolved = path.resolve(path.dirname(context.filename), specifier);
      } else if (specifier.startsWith('src/modules/')) {
        resolved = path.resolve(context.cwd, specifier);
      } else {
        return;
      }

      const sourceMatch = resolved
        .replaceAll('\\', '/')
        .match(/\/src\/modules\/([^/]+)\/infrastructure(?:\/|$)/);
      if (sourceMatch && sourceMatch[1] !== targetMatch[1]) {
        context.report({
          node: node.source,
          messageId: 'crossModuleInfrastructure',
          data: {
            targetModule: targetMatch[1],
            sourceModule: sourceMatch[1],
          },
        });
      }
    }

    return {
      ImportDeclaration: checkSource,
      ExportAllDeclaration: checkSource,
      ExportNamedDeclaration: checkSource,
    };
  },
};

const fastifyRestriction = {
  group: ['fastify', 'fastify/*', '@fastify/*'],
  message: 'Fastify belongs in the infrastructure layer.',
};

const prismaRestriction = {
  name: '@prisma/client',
  message: 'Depend on a domain repository interface instead of Prisma.',
};

module.exports = tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'webui/**'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/modules/*/infrastructure/**/*.ts'],
    plugins: {
      architecture: {
        rules: {
          'no-cross-module-infrastructure-imports': crossModuleInfrastructureRule,
        },
      },
    },
    rules: {
      'architecture/no-cross-module-infrastructure-imports': 'error',
    },
  },
  {
    files: ['src/modules/*/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        paths: [prismaRestriction],
        patterns: [fastifyRestriction],
      }],
    },
  },
  {
    files: ['src/modules/*/application/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        paths: [prismaRestriction],
        patterns: [fastifyRestriction],
      }],
    },
  },
);
