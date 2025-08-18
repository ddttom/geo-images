/**
 * Interpolation Service Tests
 * 
 * Tests for GPS coordinate interpolation functionality,
 * focusing on the priority chain and core interpolation logic.
 */

import { test } from 'node:test';
import assert from 'node:assert';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import InterpolationService from '../../src/services/interpolation.js';
import { createLogger } from '../../src/utils/debugLogger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Test configuration
const testConfig = {
  timelineTolerance: 60,
  batchSize: 25,
  enhancedFallback: {
    enabled: true,
    maxToleranceHours: 24,
    progressiveSearch: true
  }
};

const testLogger = createLogger('InterpolationTest', { 
  enableConsole: false, 
  enableFile: false 
});

test('InterpolationService - GPS Priority Chain', async (t) => {
  await t.test('should create interpolation service with correct config', () => {
    const service = new InterpolationService(testConfig, testLogger);
    assert.ok(service);
    assert.strictEqual(service.config.timelineTolerance, 60);
  });

  await t.test('should have correct priority chain order', () => {
    const service = new InterpolationService(testConfig, testLogger);
    
    // Verify the service has the expected methods for priority chain
    assert.ok(typeof service.interpolateCoordinates === 'function');
    assert.ok(typeof service.interpolateFromTimeline === 'function');
    assert.ok(typeof service.interpolateFromNearbyImages === 'function');
    assert.ok(typeof service.enhancedFallbackInterpolation === 'function');
  });

  await t.test('should validate interpolation results correctly', () => {
    const service = new InterpolationService(testConfig, testLogger);
    
    // Test valid result
    const validResult = {
      latitude: 40.7128,
      longitude: -74.0060
    };
    assert.ok(service.validateResult(validResult));
    
    // Test invalid results
    assert.ok(!service.validateResult(null));
    assert.ok(!service.validateResult({}));
    assert.ok(!service.validateResult({ latitude: 91, longitude: 0 })); // Invalid latitude
    assert.ok(!service.validateResult({ latitude: 0, longitude: 181 })); // Invalid longitude
  });
});

test('InterpolationService - Coordinate Calculation', async (t) => {
  await t.test('should calculate confidence scores correctly', () => {
    const service = new InterpolationService(testConfig, testLogger);
    
    // Test confidence calculation with good parameters
    const highConfidence = service.calculateConfidence(5, 10); // 5 minutes, 10m accuracy
    assert.ok(highConfidence > 0.8);
    
    // Test confidence calculation with poor parameters
    const lowConfidence = service.calculateConfidence(120, 1000); // 2 hours, 1km accuracy
    assert.ok(lowConfidence < 0.5);
  });

  await t.test('should calculate fallback confidence correctly', () => {
    const service = new InterpolationService(testConfig, testLogger);
    
    const fallbackConfidence = service.calculateFallbackConfidence(30, 50);
    const normalConfidence = service.calculateConfidence(30, 50);
    
    // Fallback confidence should be lower than normal confidence
    assert.ok(fallbackConfidence < normalConfidence);
    assert.ok(fallbackConfidence >= 0.1); // Should have minimum confidence
  });
});

test('InterpolationService - Spatial Interpolation', async (t) => {
  await t.test('should perform spatial interpolation correctly', () => {
    const service = new InterpolationService(testConfig, testLogger);
    
    const point1 = {
      latitude: 40.7128,
      longitude: -74.0060,
      timestamp: '2024-01-01T12:00:00Z'
    };
    
    const point2 = {
      latitude: 40.7589,
      longitude: -73.9851,
      timestamp: '2024-01-01T14:00:00Z'
    };
    
    const targetTimestamp = new Date('2024-01-01T13:00:00Z'); // Midpoint
    
    const result = service.spatialInterpolation(point1, point2, targetTimestamp);
    
    assert.ok(result);
    assert.ok(typeof result.latitude === 'number');
    assert.ok(typeof result.longitude === 'number');
    assert.ok(result.latitude > Math.min(point1.latitude, point2.latitude));
    assert.ok(result.latitude < Math.max(point1.latitude, point2.latitude));
  });

  await t.test('should return null for invalid spatial interpolation', () => {
    const service = new InterpolationService(testConfig, testLogger);
    
    // Test with target outside time range
    const point1 = {
      latitude: 40.7128,
      longitude: -74.0060,
      timestamp: '2024-01-01T12:00:00Z'
    };
    
    const point2 = {
      latitude: 40.7589,
      longitude: -73.9851,
      timestamp: '2024-01-01T14:00:00Z'
    };
    
    const targetTimestamp = new Date('2024-01-01T10:00:00Z'); // Before range
    
    const result = service.spatialInterpolation(point1, point2, targetTimestamp);
    assert.strictEqual(result, null);
  });
});

test('InterpolationService - Statistics', async (t) => {
  await t.test('should return correct statistics', () => {
    const service = new InterpolationService(testConfig, testLogger);
    
    const stats = service.getStatistics();
    
    assert.ok(typeof stats === 'object');
    assert.ok(typeof stats.nearbyImagesCount === 'number');
    assert.ok(typeof stats.enhancedFallbackEnabled === 'boolean');
    assert.strictEqual(stats.enhancedFallbackEnabled, true);
  });

  await t.test('should clear cache correctly', () => {
    const service = new InterpolationService(testConfig, testLogger);
    
    // Add some nearby images
    service.addNearbyImage('test.jpg', { latitude: 40.7128, longitude: -74.0060 }, new Date());
    
    let stats = service.getStatistics();
    assert.strictEqual(stats.nearbyImagesCount, 1);
    
    // Clear cache
    service.clearCache();
    
    stats = service.getStatistics();
    assert.strictEqual(stats.nearbyImagesCount, 0);
  });
});

test('InterpolationService - Timestamp Validation', async (t) => {
  await t.test('should throw error for null timestamp', async () => {
    const service = new InterpolationService(testConfig, testLogger);
    
    await assert.rejects(
      async () => await service.interpolateCoordinates(null, '/path/to/image.jpg'),
      {
        name: 'Error',
        message: 'Missing timestamp - GPS processing requires valid image timestamp'
      }
    );
  });

  await t.test('should throw error for undefined timestamp', async () => {
    const service = new InterpolationService(testConfig, testLogger);
    
    await assert.rejects(
      async () => await service.interpolateCoordinates(undefined, '/path/to/image.jpg'),
      {
        name: 'Error',
        message: 'Missing timestamp - GPS processing requires valid image timestamp'
      }
    );
  });

  await t.test('should throw error for empty string timestamp', async () => {
    const service = new InterpolationService(testConfig, testLogger);
    
    await assert.rejects(
      async () => await service.interpolateCoordinates('', '/path/to/image.jpg'),
      {
        name: 'Error',
        message: 'Missing timestamp - GPS processing requires valid image timestamp'
      }
    );
  });

  await t.test('should process valid timestamp without error', async () => {
    const service = new InterpolationService(testConfig, testLogger);
    
    // Mock the geolocation database to avoid actual database calls
    const mockGeolocationDb = {
      getCoordinates: () => Promise.resolve(null),
      storeCoordinates: () => Promise.resolve()
    };
    service.geolocationDb = mockGeolocationDb;
    
    const validTimestamp = new Date('2024-01-01T12:00:00Z');
    
    // This should not throw an error (though it may return null if no coordinates found)
    const result = await service.interpolateCoordinates(validTimestamp, '/path/to/image.jpg');
    
    // The result can be null if no coordinates are found, but no error should be thrown
    assert.ok(result === null || (typeof result === 'object' && result.latitude && result.longitude));
  });
});