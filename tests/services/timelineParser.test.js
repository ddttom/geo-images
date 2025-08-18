/**
 * Timeline Parser Service Tests
 * 
 * Tests for Google Maps timeline data processing and location database management.
 */

import { test } from 'node:test';
import assert from 'node:assert';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import TimelineParserService from '../../src/services/timelineParser.js';
import { createLogger } from '../../src/utils/debugLogger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const testLogger = createLogger('TimelineParserTest', { 
  enableConsole: false, 
  enableFile: false 
});

test('TimelineParserService - Initialization', async (t) => {
  await t.test('should create timeline parser service', () => {
    const service = new TimelineParserService(testLogger);
    
    assert.ok(service);
    assert.ok(service.timelineData);
    assert.ok(service.locationData);
    assert.strictEqual(service.locationData.size, 0);
  });

  await t.test('should have correct file paths', () => {
    const service = new TimelineParserService(testLogger);
    
    assert.ok(service.timelineEditsPath.includes('Timeline Edits.json'));
    assert.ok(service.locationJsonPath.includes('location.json'));
  });
});

test('TimelineParserService - Coordinate Validation', async (t) => {
  await t.test('should validate coordinates correctly', () => {
    const service = new TimelineParserService(testLogger);
    
    assert.ok(service.isValidCoordinate(40.7128, -74.0060));
    assert.ok(service.isValidCoordinate(-33.8688, 151.2093));
    assert.ok(service.isValidCoordinate(90, 180));
    assert.ok(service.isValidCoordinate(-90, -180));
    
    // Invalid coordinates
    assert.ok(!service.isValidCoordinate(91, 0));
    assert.ok(!service.isValidCoordinate(0, 181));
    assert.ok(!service.isValidCoordinate('40.7', '-74.0'));
    assert.ok(!service.isValidCoordinate(NaN, 0));
  });
});

test('TimelineParserService - Location Point Processing', async (t) => {
  await t.test('should add location points with E7 format', () => {
    const service = new TimelineParserService(testLogger);
    
    const location = {
      latitudeE7: 407128000,  // 40.7128 in E7 format
      longitudeE7: -740060000, // -74.0060 in E7 format
      accuracy: 10
    };
    
    service.addLocationPoint('2024-01-15T12:00:00Z', location, 'test_source');
    
    assert.strictEqual(service.locationData.size, 1);
    
    const stored = service.locationData.get(new Date('2024-01-15T12:00:00Z').getTime());
    assert.ok(stored);
    assert.ok(Math.abs(stored.latitude - 40.7128) < 0.0001);
    assert.ok(Math.abs(stored.longitude - (-74.0060)) < 0.0001);
    assert.strictEqual(stored.source, 'test_source');
    assert.strictEqual(stored.accuracy, 10);
  });

  await t.test('should add location points with decimal format', () => {
    const service = new TimelineParserService(testLogger);
    
    const location = {
      latitude: 40.7128,
      longitude: -74.0060,
      accuracy: 15
    };
    
    service.addLocationPoint('2024-01-15T12:00:00Z', location, 'test_decimal');
    
    assert.strictEqual(service.locationData.size, 1);
    
    const stored = service.locationData.get(new Date('2024-01-15T12:00:00Z').getTime());
    assert.ok(stored);
    assert.strictEqual(stored.latitude, 40.7128);
    assert.strictEqual(stored.longitude, -74.0060);
  });

  await t.test('should skip invalid location points', () => {
    const service = new TimelineParserService(testLogger);
    
    // Invalid coordinates
    service.addLocationPoint('2024-01-15T12:00:00Z', { latitudeE7: 0, longitudeE7: 0 }, 'invalid');
    service.addLocationPoint('2024-01-15T12:00:00Z', { latitude: 91, longitude: 0 }, 'invalid');
    service.addLocationPoint('2024-01-15T12:00:00Z', {}, 'no_coords');
    
    assert.strictEqual(service.locationData.size, 0);
  });

  await t.test('should prefer higher accuracy records', () => {
    const service = new TimelineParserService(testLogger);
    
    const timestamp = '2024-01-15T12:00:00Z';
    
    // Add lower accuracy first
    service.addLocationPoint(timestamp, {
      latitude: 40.7128,
      longitude: -74.0060,
      accuracy: 50
    }, 'low_accuracy');
    
    // Add higher accuracy (lower number = better)
    service.addLocationPoint(timestamp, {
      latitude: 40.7129,
      longitude: -74.0061,
      accuracy: 10
    }, 'high_accuracy');
    
    assert.strictEqual(service.locationData.size, 1);
    
    const stored = service.locationData.get(new Date(timestamp).getTime());
    assert.strictEqual(stored.source, 'high_accuracy');
    assert.strictEqual(stored.accuracy, 10);
  });
});

test('TimelineParserService - Coordinate Finding', async (t) => {
  await t.test('should find coordinates within tolerance', () => {
    const service = new TimelineParserService(testLogger);
    
    // Add test data
    service.addLocationPoint('2024-01-15T12:00:00Z', {
      latitude: 40.7128,
      longitude: -74.0060,
      accuracy: 10
    }, 'test');
    
    // Find coordinates within 60 minutes
    const targetTime = new Date('2024-01-15T12:30:00Z'); // 30 minutes later
    const result = service.findCoordinatesForTimestamp(targetTime, 60);
    
    assert.ok(result);
    assert.strictEqual(result.latitude, 40.7128);
    assert.strictEqual(result.longitude, -74.0060);
    assert.strictEqual(result.timeDifference, 30); // 30 minutes
  });

  await t.test('should return null when outside tolerance', () => {
    const service = new TimelineParserService(testLogger);
    
    service.addLocationPoint('2024-01-15T12:00:00Z', {
      latitude: 40.7128,
      longitude: -74.0060
    }, 'test');
    
    // Try to find coordinates 2 hours later with 60-minute tolerance
    const targetTime = new Date('2024-01-15T14:00:00Z');
    const result = service.findCoordinatesForTimestamp(targetTime, 60);
    
    assert.strictEqual(result, null);
  });

  await t.test('should find closest match within tolerance', () => {
    const service = new TimelineParserService(testLogger);
    
    // Add multiple points
    service.addLocationPoint('2024-01-15T12:00:00Z', {
      latitude: 40.7128,
      longitude: -74.0060
    }, 'point1');
    
    service.addLocationPoint('2024-01-15T12:45:00Z', {
      latitude: 40.7589,
      longitude: -73.9851
    }, 'point2');
    
    // Find coordinates at 12:30 - should find the closer one (12:45 is 15 min away, 12:00 is 30 min away)
    const targetTime = new Date('2024-01-15T12:30:00Z');
    const result = service.findCoordinatesForTimestamp(targetTime, 60);
    
    assert.ok(result);
    assert.strictEqual(result.latitude, 40.7589); // Should be point2 (closer in time: 15 min vs 30 min)
    assert.strictEqual(result.timeDifference, 15);
  });
});

test('TimelineParserService - Enhanced Fallback', async (t) => {
  await t.test('should use progressive search in fallback', () => {
    const service = new TimelineParserService(testLogger);
    
    // Add a point 2 hours away
    service.addLocationPoint('2024-01-15T10:00:00Z', {
      latitude: 40.7128,
      longitude: -74.0060
    }, 'distant');
    
    const targetTime = new Date('2024-01-15T12:00:00Z');
    
    // Should not find with default tolerance (60 minutes)
    let result = service.findCoordinatesForTimestamp(targetTime, 60);
    assert.strictEqual(result, null);
    
    // Should find with fallback (progressive search up to 24 hours)
    result = service.findCoordinatesWithFallback(targetTime, {
      maxToleranceHours: 24,
      progressiveSearch: true
    });
    
    assert.ok(result);
    assert.strictEqual(result.latitude, 40.7128);
    assert.strictEqual(result.timeDifference, 120); // 2 hours
  });
});

test('TimelineParserService - Image GPS Data', async (t) => {
  await t.test('should add image GPS data correctly', () => {
    const service = new TimelineParserService(testLogger);
    
    const gpsData = { latitude: 40.7128, longitude: -74.0060 };
    const timestamp = new Date('2024-01-15T12:00:00Z');
    
    service.addImageGPSData('test.jpg', gpsData, timestamp);
    
    assert.strictEqual(service.locationData.size, 1);
    
    const stored = service.locationData.get(timestamp.getTime());
    assert.ok(stored);
    assert.strictEqual(stored.latitude, 40.7128);
    assert.strictEqual(stored.longitude, -74.0060);
    assert.ok(stored.source.includes('test.jpg'));
    assert.strictEqual(stored.accuracy, 1); // High accuracy for image GPS
  });
});

test('TimelineParserService - Statistics', async (t) => {
  await t.test('should generate correct statistics', () => {
    const service = new TimelineParserService(testLogger);
    
    // Add test data
    service.addLocationPoint('2024-01-15T10:00:00Z', {
      latitude: 40.7128,
      longitude: -74.0060
    }, 'timeline');
    
    service.addImageGPSData('test.jpg', {
      latitude: 40.7589,
      longitude: -73.9851
    }, new Date('2024-01-15T12:00:00Z'));
    
    const stats = service.getStatistics();
    
    assert.strictEqual(stats.totalRecords, 2);
    assert.ok(stats.dateRange);
    assert.ok(stats.sources);
    assert.ok(stats.sources.timeline >= 1);
    assert.ok(Object.keys(stats.sources).some(key => key.includes('test.jpg')));
  });

  await t.test('should handle empty data in statistics', () => {
    const service = new TimelineParserService(testLogger);
    
    const stats = service.getStatistics();
    
    assert.strictEqual(stats.totalRecords, 0);
    assert.strictEqual(stats.dateRange, null);
  });
});

test('TimelineParserService - Data Management', async (t) => {
  await t.test('should clear data correctly', () => {
    const service = new TimelineParserService(testLogger);
    
    // Add some data
    service.addLocationPoint('2024-01-15T12:00:00Z', {
      latitude: 40.7128,
      longitude: -74.0060
    }, 'test');
    
    assert.strictEqual(service.locationData.size, 1);
    
    service.clearData();
    
    assert.strictEqual(service.locationData.size, 0);
    assert.strictEqual(service.timelineData.length, 0);
  });

  await t.test('should convert location data to array correctly', () => {
    const service = new TimelineParserService(testLogger);
    
    service.addLocationPoint('2024-01-15T12:00:00Z', {
      latitude: 40.7128,
      longitude: -74.0060
    }, 'test1');
    
    service.addLocationPoint('2024-01-15T10:00:00Z', {
      latitude: 40.7589,
      longitude: -73.9851
    }, 'test2');
    
    const locationArray = service.getLocationDataArray();
    
    assert.strictEqual(locationArray.length, 2);
    // Should be sorted by timestamp (earliest first)
    assert.ok(new Date(locationArray[0].timestamp) < new Date(locationArray[1].timestamp));
  });
});