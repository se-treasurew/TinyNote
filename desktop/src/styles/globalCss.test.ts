import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(resolve(__dirname, 'global.css'), 'utf8');

describe('global glass background CSS', () => {
  it('does not render a default decorative background texture or image', () => {
    expect(css).not.toContain('.app-shell::before');
    expect(css).not.toContain('.app-shell::after');
    expect(css).not.toContain('repeating-linear-gradient');
    expect(css).not.toContain('url(');
  });

  it('uses the custom background variable only when configured', () => {
    expect(css).toContain('--custom-background-image');
    expect(css).toContain('var(--custom-background-image)');
  });
});
