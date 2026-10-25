import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";

export default tseslint.config(
  { ignores: ["**/dist/**", "**/lib/**", "**/dev-dist/**", "**/node_modules/**", ".emulator-data/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { languageOptions: { globals: { ...globals.browser, ...globals.node } } },
  {
    // The Clean Architecture dependency rule: the core knows nothing about frameworks or vendors.
    files: ["packages/core/src/**/*.ts"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [
          { group: ["react", "react-*", "react/*"], message: "Core must not depend on React." },
          { group: ["firebase", "firebase/*", "firebase-*", "@firebase/*"], message: "Core must not depend on Firebase. Add a port in application/ and an adapter outside core." },
          { group: ["@google/*"], message: "Core must not depend on vendor SDKs." },
          { group: ["**/apps/**"], message: "Core must not import from apps." }
        ]
      }]
    }
  },
  {
    // Modules talk to each other only through their public index, never through internals.
    files: ["packages/core/src/**/*.ts"],
    ignores: ["packages/core/src/**/*.test.ts"],
    rules: {
      "no-restricted-syntax": ["error", {
        selector: "ImportDeclaration[source.value=/^\\.\\.\\/(?!shared)[a-z]+\\/(domain|application)/]",
        message: "Import another module through its index (e.g. '../bookings'), not its internals."
      }]
    }
  }
);
