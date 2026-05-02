const js = require("@eslint/js");
const tseslint = require("typescript-eslint");
const reactHooks = require("eslint-plugin-react-hooks");
const reactRefresh = require("eslint-plugin-react-refresh").default;

module.exports = tseslint.config(
  {
    ignores: ["dist/**", "node_modules/**"]
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh
    },
    languageOptions: {
      parserOptions: {
        projectService: true
      },
      globals: {
        window: "readonly",
        document: "readonly",
        console: "readonly",
        localStorage: "readonly"
      }
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "warn",
      "react-hooks/set-state-in-effect": "off"
    }
  },
  {
    files: ["electron/**/*.cjs", "scripts/**/*.cjs"],
    extends: [js.configs.recommended],
    languageOptions: {
      sourceType: "commonjs",
      globals: {
        module: "readonly",
        require: "readonly",
        process: "readonly",
        console: "readonly",
        __dirname: "readonly",
        Buffer: "readonly",
        fetch: "readonly",
        URL: "readonly",
        clearTimeout: "readonly",
        setTimeout: "readonly"
      }
    }
  },
  {
    files: ["scripts/**/*.mjs"],
    extends: [js.configs.recommended],
    languageOptions: {
      sourceType: "module",
      globals: {
        process: "readonly",
        console: "readonly"
      }
    }
  },
  {
    files: ["eslint.config.js"],
    extends: [js.configs.recommended],
    languageOptions: {
      sourceType: "commonjs",
      globals: {
        module: "readonly",
        require: "readonly"
      }
    }
  }
);
