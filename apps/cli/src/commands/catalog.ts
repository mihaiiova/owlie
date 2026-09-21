/**
 * Functional command registrations for the published CLI. Dispatch and the
 * credential-free capabilities manifest both use this catalog so the manifest
 * cannot drift from the commands the artifact recognizes.
 */
export const COMMAND_IDS = [
  'extract',
  'resolve',
  'list',
  'process',
  'models',
  'auth',
  'setup',
  'doctor',
  'capabilities',
  'help',
] as const;

export type CommandId = (typeof COMMAND_IDS)[number];

export function isCommandId(value: string): value is CommandId {
  return (COMMAND_IDS as readonly string[]).includes(value);
}
