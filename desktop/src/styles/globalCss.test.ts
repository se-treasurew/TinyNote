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

  it('keeps the transparent window outside the rounded shell clear', () => {
    expect(css).toContain('html,\nbody,\n#root');
    expect(css).toContain('background: transparent;');
    expect(css).toContain('clip-path: inset(0 round 18px)');
  });

  it('centers the completed task check mark inside the circular button', () => {
    expect(css).toMatch(/\.check-button\s*\{[^}]*display:\s*inline-grid;[^}]*place-items:\s*center;[^}]*padding:\s*0;[^}]*line-height:\s*0;/s);
    expect(css).toMatch(/\.check-button svg\s*\{[^}]*display:\s*block;[^}]*width:\s*11px;[^}]*height:\s*11px;/s);
  });
});
