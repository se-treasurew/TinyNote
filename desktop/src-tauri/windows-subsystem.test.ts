import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Windows release subsystem', () => {
  it('hides the console window for release builds', () => {
    const mainRs = readFileSync(resolve(__dirname, 'src/main.rs'), 'utf8');

    expect(mainRs).toContain('#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]');
  });
});
