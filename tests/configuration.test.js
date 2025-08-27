#!/usr/bin/env node

/**
 * Configuration Tests
 * 
 * Tests the new configurable photo directory functionality
 * to ensure it works correctly with different path formats.
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { resolvePath } from '../src/utils/input.js';
import { homedir } from 'os';
import { resolve } from 'path';

test('resolvePath function', async (t) => {
  await t.test('should expand tilde paths correctly', () => {
    const result = resolvePath('~/pics');
    const expected = resolve(homedir(), 'pics');
    assert.equal(result, expected);
  });

  await t.test('should resolve relative paths correctly', () => {
    const result = resolvePath('./test-images');
    const expected = resolve(process.cwd(), 'test-images');
    assert.equal(result, expected);
  });

  await t.test('should handle absolute paths correctly', () => {
    const result = resolvePath('/absolute/path');
    assert.equal(result, '/absolute/path');
  });

  await t.test('should handle empty strings', () => {
    const result = resolvePath('');
    assert.equal(result, '');
  });

  await t.test('should handle null/undefined inputs', () => {
    assert.equal(resolvePath(null), '');
    assert.equal(resolvePath(undefined), '');
  });

  await t.test('should expand home directory only', () => {
    const result = resolvePath('~');
    assert.equal(result, homedir());
  });

  if (process.platform === 'win32') {
    await t.test('should handle Windows absolute paths', () => {
      const result = resolvePath('C:\\Users\\Test\\Pictures');
      const expected = resolve('C:\\Users\\Test\\Pictures');
      assert.equal(result, expected);
    });
  }
});

test('environment variable integration', async (t) => {
  await t.test('should use DEFAULT_PHOTO_DIR when set', () => {
    const originalEnv = process.env.DEFAULT_PHOTO_DIR;
    
    try {
      process.env.DEFAULT_PHOTO_DIR = '~/test-pics';
      const envDefault = process.env.DEFAULT_PHOTO_DIR || '~/pics';
      const result = resolvePath(envDefault);
      const expected = resolve(homedir(), 'test-pics');
      assert.equal(result, expected);
    } finally {
      if (originalEnv !== undefined) {
        process.env.DEFAULT_PHOTO_DIR = originalEnv;
      } else {
        delete process.env.DEFAULT_PHOTO_DIR;
      }
    }
  });

  await t.test('should fallback to ~/pics when DEFAULT_PHOTO_DIR is not set', () => {
    const originalEnv = process.env.DEFAULT_PHOTO_DIR;
    
    try {
      delete process.env.DEFAULT_PHOTO_DIR;
      const envDefault = process.env.DEFAULT_PHOTO_DIR || '~/pics';
      const result = resolvePath(envDefault);
      const expected = resolve(homedir(), 'pics');
      assert.equal(result, expected);
    } finally {
      if (originalEnv !== undefined) {
        process.env.DEFAULT_PHOTO_DIR = originalEnv;
      }
    }
  });

  await t.test('should handle relative paths in environment variable', () => {
    const originalEnv = process.env.DEFAULT_PHOTO_DIR;
    
    try {
      process.env.DEFAULT_PHOTO_DIR = './relative-pics';
      const envDefault = process.env.DEFAULT_PHOTO_DIR || '~/pics';
      const result = resolvePath(envDefault);
      const expected = resolve(process.cwd(), 'relative-pics');
      assert.equal(result, expected);
    } finally {
      if (originalEnv !== undefined) {
        process.env.DEFAULT_PHOTO_DIR = originalEnv;
      } else {
        delete process.env.DEFAULT_PHOTO_DIR;
      }
    }
  });
});

test('cross-platform compatibility', async (t) => {
  await t.test('should work on current platform', () => {
    const testPaths = [
      '~/test',
      './relative',
      '../parent'
    ];

    testPaths.forEach(path => {
      const result = resolvePath(path);
      assert.ok(typeof result === 'string');
      assert.ok(result.length > 0);
    });
  });
});

test('edge cases', async (t) => {
  await t.test('should handle non-string inputs gracefully', () => {
    assert.equal(resolvePath(123), '');
    assert.equal(resolvePath({}), '');
    assert.equal(resolvePath([]), '');
    assert.equal(resolvePath(true), '');
  });

  await t.test('should handle special characters in paths', () => {
    const testPath = '~/pics with spaces';
    const result = resolvePath(testPath);
    const expected = resolve(homedir(), 'pics with spaces');
    assert.equal(result, expected);
  });
});