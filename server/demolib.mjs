// Where the demo practice's shared Resources library lives (built by scripts/make-demo-library.mjs).
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEMO_LIBRARY = path.join(path.dirname(fileURLToPath(import.meta.url)), 'demo-library');
