/**
 * EXIF Service Tests
 * 
 * Tests for EXIF metadata extraction and GPS data writing functionality.
 * Note: These tests focus on the service logic rather than actual file operations.
 */

import { test } from 'node:test';
import assert from 'node:assert';
import ExifService from '../../src/services/exif.js';
import { createLogger } from '../../src/utils/debugLogger.js';

const testLogger = createLogger('ExifTest', { 
  enableConsole: false, 
  enableFile: false 
});

test('ExifService - Initialization', async (t) => {
  await t.test('should create EXIF service with correct format sets', () => {
    const service = new ExifService(testLogger);
    
    assert.ok(service);
    assert.ok(service.piexifFormats);
    assert.ok(service.exiftoolFormats);
    assert.ok(service.sharpFormats);
    
    // Check format categorization
    assert.ok(service.piexifFormats.has('.jpg'));
    assert.ok(service.piexifFormats.has('.jpeg'));
    assert.ok(service.piexifFormats.has('.tiff'));
    
    assert.ok(service.exiftoolFormats.has('.cr3'));
    assert.ok(service.exiftoolFormats.has('.cr2'));
    assert.ok(service.exiftoolFormats.has('.nef'));
    
    assert.ok(service.sharpFormats.has('.png'));
    assert.ok(service.sharpFormats.has('.webp'));
    assert.ok(service.sharpFormats.has('.heic'));
  });
});

test('ExifService - Coordinate Conversion', async (t) => {
  await t.test('should convert decimal coordinates to EXIF GPS format', () => {
    const service = new ExifService(testLogger);
    
    const coordinates = { latitude: 40.7128, longitude: -74.0060 };
    const gpsData = service.coordinatesToExifGPS(coordinates);
    
    assert.ok(gpsData);
    // Check that GPS data object has the expected structure
    assert.ok(typeof gpsData === 'object');
    // The actual keys depend on piexif constants, so we check for GPS data presence
    const keys = Object.keys(gpsData);
    assert.ok(keys.length > 0);
  });

  await t.test('should convert decimal to DMS correctly', () => {
    const service = new ExifService(testLogger);
    
    const dms = service.decimalToDMS(40.7128);
    
    assert.ok(Array.isArray(dms));
    assert.strictEqual(dms.length, 3);
    assert.strictEqual(dms[0][0], 40); // degrees
    assert.strictEqual(dms[0][1], 1);  // denominator
    assert.ok(dms[1][0] >= 42 && dms[1][0] <= 43); // minutes
    assert.ok(dms[2][0] >= 0); // seconds
  });

  await t.test('should convert DMS to decimal correctly', () => {
    const service = new ExifService(testLogger);
    
    const dms = [[40, 1], [42, 1], [46080, 1000]]; // 40°42'46.08"
    const decimal = service.dmsToDecimal(dms);
    
    assert.ok(Math.abs(decimal - 40.7128) < 0.01);
  });
});

test('ExifService - Camera Information', async (t) => {
  await t.test('should extract camera information correctly', () => {
    const service = new ExifService(testLogger);
    
    // Use a simplified mock that matches the actual EXIF structure
    const exifData = {
      '0th': {
        271: 'Canon',           // Make
        272: 'EOS R5',          // Model
      },
      Exif: {
        42036: 'RF 24-70mm f/2.8L IS USM' // LensModel
      }
    };
    
    const cameraInfo = service.extractCameraInfo(exifData);
    
    assert.strictEqual(cameraInfo.make, 'Canon');
    assert.strictEqual(cameraInfo.model, 'EOS R5');
    assert.strictEqual(cameraInfo.lens, 'RF 24-70mm f/2.8L IS USM');
  });

  await t.test('should handle missing camera information gracefully', () => {
    const service = new ExifService(testLogger);
    
    const emptyExifData = { '0th': {}, Exif: {} };
    const cameraInfo = service.extractCameraInfo(emptyExifData);
    
    assert.strictEqual(cameraInfo.make, null);
    assert.strictEqual(cameraInfo.model, null);
    assert.strictEqual(cameraInfo.lens, null);
  });
});

test('ExifService - Empty Metadata Creation', async (t) => {
  await t.test('should create empty metadata with correct structure', () => {
    const service = new ExifService(testLogger);
    
    const emptyMetadata = service.createEmptyMetadata();
    
    assert.strictEqual(emptyMetadata.hasGPS, false);
    assert.strictEqual(emptyMetadata.latitude, null);
    assert.strictEqual(emptyMetadata.longitude, null);
    assert.strictEqual(emptyMetadata.timestamp, null);
    assert.ok(typeof emptyMetadata.camera === 'object');
    assert.strictEqual(emptyMetadata.camera.make, null);
    assert.strictEqual(emptyMetadata.camera.model, null);
    assert.strictEqual(emptyMetadata.camera.lens, null);
  });
});

test('ExifService - Timestamp Parsing', async (t) => {
  await t.test('should parse exiftool timestamps correctly', () => {
    const service = new ExifService(testLogger);
    
    const tags = {
      DateTimeOriginal: '2024-01-15T14:30:25',
      CreateDate: '2024-01-15T14:30:20'
    };
    
    const timestamp = service.parseExiftoolTimestamp(tags);
    
    assert.ok(timestamp instanceof Date);
    assert.strictEqual(timestamp.getFullYear(), 2024);
  });

  await t.test('should handle missing timestamps gracefully', () => {
    const service = new ExifService(testLogger);
    
    const emptyTags = {};
    const timestamp = service.parseExiftoolTimestamp(emptyTags);
    
    assert.strictEqual(timestamp, null);
  });
});

test('ExifService - Basic Functionality', async (t) => {
  await t.test('should handle coordinate validation', () => {
    const service = new ExifService(testLogger);
    
    // Test that service can handle basic coordinate operations
    const validCoords = { latitude: 40.7128, longitude: -74.0060 };
    const gpsData = service.coordinatesToExifGPS(validCoords);
    
    // Should return some GPS data structure
    assert.ok(gpsData);
    assert.ok(typeof gpsData === 'object');
  });

  await t.test('should handle DMS conversion edge cases', () => {
    const service = new ExifService(testLogger);
    
    // Test zero coordinates
    const zeroDMS = service.decimalToDMS(0);
    assert.ok(Array.isArray(zeroDMS));
    assert.strictEqual(zeroDMS[0][0], 0);
    
    // Test negative coordinates - DMS preserves sign in raw conversion
    const negativeDMS = service.decimalToDMS(-40.7128);
    assert.ok(Array.isArray(negativeDMS));
    assert.strictEqual(negativeDMS[0][0], -41); // Raw DMS conversion preserves sign
  });
});