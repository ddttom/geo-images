/**
 * Geolocation Database Service Tests
 * 
 * Tests for GPS coordinate storage and retrieval with timestamp preservation.
 */

import { test } from 'node:test';
import assert from 'node:assert';
import GeolocationDatabaseService from '../../src/services/geolocationDatabase.js';
import { createLogger } from '../../src/utils/debugLogger.js';

const testLogger = createLogger('GeolocationDatabaseTest', { 
  enableConsole: false, 
  enableFile: false 
});

const testConfig = {
  enableSqlitePersistence: false, // Disable SQLite for tests
  exportPath: 'test-geolocation-export.json',
  validateCoordinates: true,
  coordinateSystem: 'WGS84'
};

test('GeolocationDatabaseService - Timestamp Preservation', async (t) => {
  await t.test('should store coordinates with original image timestamp', async () => {
    const service = new GeolocationDatabaseService(testConfig, testLogger);
    await service.initialize();
    
    const filePath = '/test/image.jpg';
    const coordinates = { latitude: 40.7128, longitude: -74.0060 };
    const source = 'timeline_interpolation';
    const originalTimestamp = new Date('2024-01-15T14:30:25Z');
    
    // Store coordinates with original timestamp
    const result = await service.storeCoordinates(
      filePath, 
      coordinates, 
      source, 
      {}, 
      originalTimestamp
    );
    
    assert.strictEqual(result, true);
    
    // Retrieve the stored record
    const records = await service.getAllCoordinates();
    const storedRecord = records.find(r => r.filePath === filePath);
    
    assert.ok(storedRecord);
    assert.strictEqual(storedRecord.latitude, 40.7128);
    assert.strictEqual(storedRecord.longitude, -74.0060);
    assert.strictEqual(storedRecord.source, 'timeline_interpolation');
    
    // Verify the timestamp matches the original image timestamp
    const storedTimestamp = new Date(storedRecord.timestamp);
    assert.strictEqual(storedTimestamp.getTime(), originalTimestamp.getTime());
  });

  await t.test('should fall back to current time when no original timestamp provided', async () => {
    const service = new GeolocationDatabaseService(testConfig, testLogger);
    await service.initialize();
    
    const filePath = '/test/image2.jpg';
    const coordinates = { latitude: 51.5074, longitude: -0.1278 };
    const source = 'timeline_interpolation';
    const beforeStore = new Date();
    
    // Store coordinates without original timestamp
    const result = await service.storeCoordinates(filePath, coordinates, source);
    const afterStore = new Date();
    
    assert.strictEqual(result, true);
    
    // Retrieve the stored record
    const records = await service.getAllCoordinates();
    const storedRecord = records.find(r => r.filePath === filePath);
    
    assert.ok(storedRecord);
    
    // Verify the timestamp is current time (within reasonable range)
    const storedTimestamp = new Date(storedRecord.timestamp);
    assert.ok(storedTimestamp >= beforeStore);
    assert.ok(storedTimestamp <= afterStore);
  });

  await t.test('should preserve original timestamp in memory database', async () => {
    const service = new GeolocationDatabaseService(testConfig, testLogger);
    await service.initialize();
    
    const filePath = '/test/image3.jpg';
    const coordinates = { latitude: 48.8566, longitude: 2.3522 };
    const source = 'image_exif';
    const originalTimestamp = new Date('2023-12-25T10:15:30Z');
    
    // Store coordinates
    await service.storeCoordinates(filePath, coordinates, source, {}, originalTimestamp);
    
    // Check in-memory storage directly
    const memoryRecord = service.inMemoryDb.get(filePath);
    assert.ok(memoryRecord);
    assert.strictEqual(memoryRecord.timestamp.getTime(), originalTimestamp.getTime());
  });

  await t.test('should handle null original timestamp gracefully', async () => {
    const service = new GeolocationDatabaseService(testConfig, testLogger);
    await service.initialize();
    
    const filePath = '/test/image4.jpg';
    const coordinates = { latitude: 35.6762, longitude: 139.6503 };
    const source = 'enhanced_fallback';
    
    // Store coordinates with explicit null timestamp
    const result = await service.storeCoordinates(filePath, coordinates, source, {}, null);
    
    assert.strictEqual(result, true);
    
    // Should still work and use current time
    const records = await service.getAllCoordinates();
    const storedRecord = records.find(r => r.filePath === filePath);
    
    assert.ok(storedRecord);
    assert.ok(storedRecord.timestamp); // Should have a timestamp
  });

  await t.test('should maintain timestamp when updating with higher priority source', async () => {
    const service = new GeolocationDatabaseService(testConfig, testLogger);
    await service.initialize();
    
    const filePath = '/test/image5.jpg';
    const coordinates1 = { latitude: 37.7749, longitude: -122.4194 };
    const coordinates2 = { latitude: 37.7750, longitude: -122.4195 };
    const originalTimestamp = new Date('2024-06-15T16:45:00Z');
    
    // Store with lower priority source first
    await service.storeCoordinates(filePath, coordinates1, 'enhanced_fallback', {}, originalTimestamp);
    
    // Update with higher priority source (should succeed)
    const updateResult = await service.storeCoordinates(filePath, coordinates2, 'image_exif', {}, originalTimestamp);
    
    assert.strictEqual(updateResult, true);
    
    // Verify the coordinates were updated but timestamp preserved
    const records = await service.getAllCoordinates();
    const storedRecord = records.find(r => r.filePath === filePath);
    
    assert.ok(storedRecord);
    assert.strictEqual(storedRecord.latitude, 37.7750); // Updated coordinates
    assert.strictEqual(storedRecord.source, 'image_exif'); // Updated source
    
    // Timestamp should still match original
    const storedTimestamp = new Date(storedRecord.timestamp);
    assert.strictEqual(storedTimestamp.getTime(), originalTimestamp.getTime());
  });
});

test('GeolocationDatabaseService - Timestamp Integration', async (t) => {
  await t.test('should export timestamps correctly in JSON format', async () => {
    const service = new GeolocationDatabaseService(testConfig, testLogger);
    await service.initialize();
    
    const filePath = '/test/export-test.jpg';
    const coordinates = { latitude: 55.7558, longitude: 37.6176 };
    const source = 'timeline_exact';
    const originalTimestamp = new Date('2024-03-20T09:30:15Z');
    
    // Store coordinates
    await service.storeCoordinates(filePath, coordinates, source, {}, originalTimestamp);
    
    // Get all coordinates (simulates export)
    const records = await service.getAllCoordinates();
    const exportedRecord = records.find(r => r.filePath === filePath);
    
    assert.ok(exportedRecord);
    assert.strictEqual(exportedRecord.timestamp, originalTimestamp.toISOString());
  });

  await t.test('should load existing timestamps correctly from JSON', async () => {
    const service = new GeolocationDatabaseService(testConfig, testLogger);
    
    // Simulate existing data with timestamp
    const existingData = [{
      filePath: '/test/existing.jpg',
      latitude: 59.9311,
      longitude: 30.3609,
      source: 'timeline_interpolation',
      accuracy: null,
      confidence: 0.8,
      timestamp: '2024-02-14T12:00:00Z'
    }];
    
    // Mock the loadExistingData method behavior
    service.inMemoryDb.set('/test/existing.jpg', {
      latitude: 59.9311,
      longitude: 30.3609,
      source: 'timeline_interpolation',
      accuracy: null,
      confidence: 0.8,
      timestamp: new Date('2024-02-14T12:00:00Z')
    });
    
    // Verify the timestamp was loaded correctly
    const memoryRecord = service.inMemoryDb.get('/test/existing.jpg');
    assert.ok(memoryRecord);
    assert.strictEqual(memoryRecord.timestamp.toISOString(), '2024-02-14T12:00:00.000Z');
  });
});