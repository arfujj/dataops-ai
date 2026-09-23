import tseslint from "typescript-eslint";

export default tseslint.config(
  ...tseslint.configs.recommended,
  {
    ignores: [".next/**", "out/**", "build/**", "node_modules/**", "next-env.d.ts"],
  },
);
