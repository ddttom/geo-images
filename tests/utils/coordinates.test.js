/**
 * Coordinates Utility Tests
 * 
 * Tests for GPS coordinate validation, conversion, and manipulation functions.
 */

import { test } from 'node:test';
import assert from 'node:assert';
import {
  validateCoordinates,
  decimalToDMS,
  dmsToDecimal,
  formatCoordinates,
  parseCoordinates,
  calculateCenter,
  isWithinBounds,
  createBoundingBox,
  normalizeLongitude,
  normalizeLatitude,
  coordinatesEqual
} from '../../src/utils/coordinates.js';

test('Coordinate Validation', async (t) => {
  await t.test('should validate correct coordinates', () => {
    assert.ok(validateCoordinates(40.7128, -74.0060)); // New York
    assert.ok(validateCoordinates(51.5074, -0.1278));  // London
    assert.ok(validateCoordinates(-33.8688, 151.2093)); // Sydney
    assert.ok(validateCoordinates(90, 180));   // Edge cases
    assert.ok(validateCoordinates(-90, -180)); // Edge cases
  });

  await t.test('should reject invalid coordinates', () => {
    assert.ok(!validateCoordinates(91, 0));    // Invalid latitude
    assert.ok(!validateCoordinates(-91, 0));   // Invalid latitude
    assert.ok(!validateCoordinates(0, 181));   // Invalid longitude
    assert.ok(!validateCoordinates(0, -181));  // Invalid longitude
    assert.ok(!validateCoordinates(0, 0));     // Null island
    assert.ok(!validateCoordinates('40.7', '-74.0')); // String inputs
    assert.ok(!validateCoordinates(NaN, 0));   // NaN
    assert.ok(!validateCoordinates(0, Infinity)); // Infinity
  });
});

test('DMS Conversion', async (t) => {
  await t.test('should convert decimal to DMS correctly', () => {
    const result = decimalToDMS(40.7128);
    
    assert.strictEqual(result.degrees, 40);
    assert.ok(result.minutes >= 42 && result.minutes <= 43);
    assert.ok(result.seconds >= 0 && result.seconds <= 60);
    assert.strictEqual(result.direction, 'positive');
  });

  await t.test('should convert negative decimal to DMS correctly', () => {
    const result = decimalToDMS(-74.0060);
    
    assert.strictEqual(result.degrees, 74);
    assert.strictEqual(result.direction, 'negative');
  });

  await t.test('should convert DMS to decimal correctly', () => {
    const decimal = dmsToDecimal(40, 42, 46, 'N');
    assert.ok(Math.abs(decimal - 40.7128) < 0.01);
    
    const negativeDecimal = dmsToDecimal(74, 0, 21, 'W');
    assert.ok(Math.abs(negativeDecimal - (-74.0058)) < 0.01);
  });
});

test('Coordinate Formatting', async (t) => {
  await t.test('should format coordinates in decimal format', () => {
    const formatted = formatCoordinates(40.7128, -74.0060, 'decimal', 4);
    assert.strictEqual(formatted, '40.7128, -74.0060');
  });

  await t.test('should format coordinates in DMS format', () => {
    const formatted = formatCoordinates(40.7128, -74.0060, 'dms');
    assert.ok(formatted.includes('40°'));
    assert.ok(formatted.includes('74°'));
    assert.ok(formatted.includes('N'));
    assert.ok(formatted.includes('W'));
  });

  await t.test('should handle invalid coordinates in formatting', () => {
    const formatted = formatCoordinates(91, 0, 'decimal');
    assert.strictEqual(formatted, 'Invalid coordinates');
  });
});

test('Coordinate Parsing', async (t) => {
  await t.test('should parse decimal coordinate strings', () => {
    const result = parseCoordinates('40.7128, -74.0060');
    assert.ok(result);
    assert.ok(Math.abs(result.latitude - 40.7128) < 0.0001);
    assert.ok(Math.abs(result.longitude - (-74.0060)) < 0.0001);
  });

  await t.test('should parse DMS coordinate strings', () => {
    const result = parseCoordinates('40°42\'46"N, 74°0\'21"W');
    assert.ok(result);
    assert.ok(Math.abs(result.latitude - 40.7128) < 0.01);
    assert.ok(Math.abs(result.longitude - (-74.0058)) < 0.01);
  });

  await t.test('should return null for invalid coordinate strings', () => {
    assert.strictEqual(parseCoordinates('invalid'), null);
    assert.strictEqual(parseCoordinates(''), null);
    assert.strictEqual(parseCoordinates(null), null);
  });
});

test('Coordinate Center Calculation', async (t) => {
  await t.test('should calculate center of multiple coordinates', () => {
    const coordinates = [
      { latitude: 40.0, longitude: -74.0 },
      { latitude: 42.0, longitude: -72.0 },
      { latitude: 38.0, longitude: -76.0 }
    ];
    
    const center = calculateCenter(coordinates);
    assert.ok(center);
    assert.ok(Math.abs(center.latitude - 40.0) < 0.1);
    assert.ok(Math.abs(center.longitude - (-74.0)) < 0.1);
  });

  await t.test('should return null for empty coordinate array', () => {
    assert.strictEqual(calculateCenter([]), null);
    assert.strictEqual(calculateCenter(null), null);
  });

  await t.test('should filter invalid coordinates when calculating center', () => {
    const coordinates = [
      { latitude: 40.0, longitude: -74.0 },
      { latitude: 91.0, longitude: -72.0 }, // Invalid
      { latitude: 42.0, longitude: -76.0 }
    ];
    
    const center = calculateCenter(coordinates);
    assert.ok(center);
    // Should only use the 2 valid coordinates
    assert.ok(Math.abs(center.latitude - 41.0) < 0.1);
  });
});

test('Bounding Box Operations', async (t) => {
  await t.test('should check if coordinates are within bounds', () => {
    const bounds = { north: 45, south: 35, east: -70, west: -80 };
    
    assert.ok(isWithinBounds(40.7128, -74.0060, bounds));
    assert.ok(!isWithinBounds(50.0, -74.0, bounds)); // Too far north
    assert.ok(!isWithinBounds(40.0, -60.0, bounds)); // Too far east
  });

  await t.test('should create bounding box around center point', () => {
    const bbox = createBoundingBox(40.7128, -74.0060, 10); // 10km radius
    
    assert.ok(bbox);
    assert.ok(bbox.north > 40.7128);
    assert.ok(bbox.south < 40.7128);
    assert.ok(bbox.east > -74.0060);
    assert.ok(bbox.west < -74.0060);
  });
});

test('Coordinate Normalization', async (t) => {
  await t.test('should normalize longitude correctly', () => {
    assert.strictEqual(normalizeLongitude(180), 180);
    assert.strictEqual(normalizeLongitude(-180), -180);
    assert.strictEqual(normalizeLongitude(181), -179);
    assert.strictEqual(normalizeLongitude(-181), 179);
    assert.strictEqual(normalizeLongitude(360), 0);
  });

  await t.test('should normalize latitude correctly', () => {
    assert.strictEqual(normalizeLatitude(90), 90);
    assert.strictEqual(normalizeLatitude(-90), -90);
    assert.strictEqual(normalizeLatitude(91), 90);
    assert.strictEqual(normalizeLatitude(-91), -90);
  });
});

test('Coordinate Equality', async (t) => {
  await t.test('should check coordinate equality with tolerance', () => {
    const coord1 = { latitude: 40.7128, longitude: -74.0060 };
    const coord2 = { latitude: 40.7129, longitude: -74.0061 };
    const coord3 = { latitude: 40.8000, longitude: -74.0060 };
    
    assert.ok(coordinatesEqual(coord1, coord2, 0.001)); // Within tolerance
    assert.ok(!coordinatesEqual(coord1, coord3, 0.001)); // Outside tolerance
  });

  await t.test('should handle null coordinates in equality check', () => {
    const coord1 = { latitude: 40.7128, longitude: -74.0060 };
    
    assert.ok(!coordinatesEqual(coord1, null));
    assert.ok(!coordinatesEqual(null, coord1));
    assert.ok(!coordinatesEqual(null, null));
  });
});