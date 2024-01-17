module.exports = {
  parser: "@typescript-eslint/parser",
  env: { es6: true },
  plugins: [
    "@typescript-eslint",
  ],
  extends: [
    "eslint:recommended", 
    "plugin:@typescript-eslint/eslint-recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:@typescript-eslint/recommended-requiring-type-checking",
  ],
  parserOptions: {
    ecmaVersion: 2019,
    sourceType: "module",
    project: [
      "./tsconfig.json",
    ],
  },
  "rules": {
    "max-len": ["warn", {"code": 80}],
    "indent": ["error", 2],
    "linebreak-style": ["error", "unix"],
    "quotes": ["error", "double"],
    "no-trailing-spaces": ["error"],
    "semi": ["error", "always"],
    "no-unused-vars": ["error", { "argsIgnorePattern": "^_" }],
    "@typescript-eslint/no-unused-vars": ["error", { "argsIgnorePattern": "^_" }],
    "no-console": ["warn"],
  }
};
