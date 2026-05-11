import { FlatCompat } from '@eslint/eslintrc'
import js from '@eslint/js'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
})

const config = [
  {
    ignores: ['.next/**', 'node_modules/**', 'dist/**', 'build/**', '.eslintrc.cjs', 'tests/e2e/**'],
  },
  ...compat.extends('next/core-web-vitals'),
]

export default config
