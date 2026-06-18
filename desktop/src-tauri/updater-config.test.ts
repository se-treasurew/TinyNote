import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

interface TauriConfig {
  bundle: {
    createUpdaterArtifacts?: boolean | string;
  };
  plugins?: {
    updater?: {
      pubkey?: string;
      endpoints?: string[];
      windows?: {
        installMode?: string;
      };
    };
  };
}

interface CapabilityFile {
  permissions: string[];
}

describe('Tauri updater configuration', () => {
  it('builds signed updater artifacts and checks GitHub latest.json', () => {
    const config = JSON.parse(
      readFileSync(resolve(process.cwd(), 'src-tauri/tauri.conf.json'), 'utf8'),
    ) as TauriConfig;

    expect(config.bundle.createUpdaterArtifacts).toBe(true);
    expect(config.plugins?.updater?.pubkey).toEqual(expect.stringMatching(/^[A-Za-z0-9+/=]{32,}$/));
    expect(config.plugins?.updater?.endpoints).toContain(
      'https://github.com/se-treasurew/TinyNote/releases/latest/download/latest.json',
    );
    expect(config.plugins?.updater?.windows?.installMode).toBe('passive');
  });

  it('allows updater, process, opener, and minimize permissions', () => {
    const capability = JSON.parse(
      readFileSync(resolve(process.cwd(), 'src-tauri/capabilities/default.json'), 'utf8'),
    ) as CapabilityFile;

    expect(capability.permissions).toEqual(expect.arrayContaining([
      'updater:default',
      'process:default',
      'opener:default',
      'core:window:allow-minimize',
    ]));
  });
});
