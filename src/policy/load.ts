import { readFileSync } from 'node:fs'
import { parse as parseYaml } from 'yaml'
import { PolicySchema, type Policy } from './schema.js'

export function parsePolicy(source: string): Policy {
  return PolicySchema.parse(parseYaml(source))
}

export function loadPolicy(path: string): Policy {
  return parsePolicy(readFileSync(path, 'utf-8'))
}
