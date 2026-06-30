import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function readPngSize(path: string): [number, number] {
  const bytes = readFileSync(path);
  expect(bytes.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
}

function readIcoSizes(path: string): Array<[number, number]> {
  const bytes = readFileSync(path);
  expect(bytes.readUInt16LE(0)).toBe(0);
  expect(bytes.readUInt16LE(2)).toBe(1);

  return Array.from({ length: bytes.readUInt16LE(4) }, (_, index) => {
    const offset = 6 + index * 16;
    return [bytes[offset] || 256, bytes[offset + 1] || 256];
  });
}

describe('Tauri application icon assets', () => {
  it('keeps a square source image and the configured Windows icon sizes', () => {
    const iconsDirectory = resolve(process.cwd(), 'src-tauri/icons');
    const sourcePath = resolve(iconsDirectory, 'icon-source.png');

    expect(existsSync(sourcePath)).toBe(true);
    if (!existsSync(sourcePath)) {
      return;
    }

    expect(readPngSize(sourcePath)).toEqual([1452, 1452]);
    expect(readPngSize(resolve(iconsDirectory, '32x32.png'))).toEqual([32, 32]);
    expect(readPngSize(resolve(iconsDirectory, '128x128.png'))).toEqual([128, 128]);
    expect(readPngSize(resolve(iconsDirectory, '128x128@2x.png'))).toEqual([256, 256]);

    const icoSizes = readIcoSizes(resolve(iconsDirectory, 'icon.ico'));
    expect(icoSizes.length).toBeGreaterThanOrEqual(5);
    expect(icoSizes).toEqual(expect.arrayContaining([
      [16, 16],
      [32, 32],
      [48, 48],
      [64, 64],
      [256, 256],
    ]));
  });

  it('rebuilds the executable when a configured icon changes', () => {
    const buildScript = readFileSync(resolve(process.cwd(), 'src-tauri/build.rs'), 'utf8');

    expect(buildScript).toContain('cargo:rerun-if-changed={icon}');
    expect(buildScript).toContain('"icons/32x32.png"');
    expect(buildScript).toContain('"icons/128x128.png"');
    expect(buildScript).toContain('"icons/128x128@2x.png"');
    expect(buildScript).toContain('"icons/icon.ico"');
  });

  it('uses the application icon for the NSIS installer and uninstaller', () => {
    const config = JSON.parse(
      readFileSync(resolve(process.cwd(), 'src-tauri/tauri.conf.json'), 'utf8'),
    );

    expect(config.bundle.windows.nsis.installerIcon).toBe('icons/icon.ico');
    expect(config.bundle.windows.nsis.uninstallerIcon).toBe('icons/icon.ico');
  });
});
