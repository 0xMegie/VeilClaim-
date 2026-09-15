// Midnight's runtime libraries expect Node's Buffer. This module must be the first import in main.tsx:
// ES imports are hoisted, so assigning Buffer in main.tsx itself would run after the app's modules load.
import { Buffer } from 'buffer';

(globalThis as { Buffer?: typeof Buffer }).Buffer ??= Buffer;
