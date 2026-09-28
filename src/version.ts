import { createRequire } from 'node:module';

/* Resolved at runtime from dist/ → ../package.json, so npm, the .mcpb bundle and
   the Docker image all report the version they actually ship. */
export const VERSION: string = (createRequire(import.meta.url)('../package.json') as { version: string }).version;
