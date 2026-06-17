import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

interface TauriConfig {
  app: {
    windows: Array<{
      label?: string;
      transparent?: boolean;
      decorations?: boolean;
      shadow?: boolean;
    }>;
  };
}

describe('Tauri transparent window styling', () => {
  it('does not enable the native rectangular shadow for the rounded transparent main window', () => {
    const config = JSON.parse(
      readFileSync(resolve(process.cwd(), 'src-tauri/tauri.conf.json'), 'utf8'),
    ) as TauriConfig;
    const mainWindow = config.app.windows.find((window) => window.label === 'main');

    expect(mainWindow).toMatchObject({
      transparent: true,
      decorations: false,
      shadow: false,
    });
  });
});
