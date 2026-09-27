import { test } from 'vitest';

// Original Node assert checks remain directly runnable and execute inside Vitest too.
test.each(['model', 'spatial', 'cad', 'doors', 'layout-store'])('original check-%s', async name => {
  await import(`../scripts/check-${name}.mjs`);
});
