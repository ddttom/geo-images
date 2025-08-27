/**
 * Configuration Utility
 * 
 * Centralized configuration management for geo scanning operations.
 * Provides default settings, environment variable integration, and
 * configuration validation.
 * 
 * @author Tom Cranstoun <ddttom@github.com>
 */

import { join } from 'path';
import { resolvePath } from './input.js';

/**
 * Default configuration for geo scanning operations
 */
export const DEFAULT_CONFIG = {
  // Default directory paths (configurable via environment variable)
  defaultScanDirectory: resolvePath(process.env.DEFAULT_PHOTO_DIR || '~/pics'),
  locationDataPath: join(process.cwd(), 'data', 'location.json'),
  
  // Duplicate detection tolerances
  duplicateDetection: {
    coordinateTolerance: 0.0001,     // ~11 meters
    timestampTolerance: 60 * 1000,   // 60 seconds in milliseconds
    enableFileHashCheck: true        // Enable file hash comparison
  },
  
  // Processing configuration
  batchSize: 50,                     // Images to process per batch
  progressReportInterval: 25,        // Report progress every N images
  
  // GPS validation bounds (worldwide)
  gpsValidation: {
    minLatitude: -90,
    maxLatitude: 90,
    minLongitude: -180,
    maxLongitude: 180,
    enableBoundsCheck: true
  },
  
  // EXIF processing options
  exif: {
    useFileTimestampFallback: false,  // Only use EXIF timestamps for geo data
    enableMultiFormatSupport: true
  }
};

/**
 * Create configuration object with environment variable overrides
 * @param {Object} customConfig - Custom configuration overrides
 * @returns {Object} Merged configuration object
 */
export function createConfig(customConfig = {}) {
  const config = { ...DEFAULT_CONFIG };
  
  // Apply environment variable overrides
  if (process.env.DEFAULT_PHOTO_DIR) {
    config.defaultScanDirectory = resolvePath(process.env.DEFAULT_PHOTO_DIR);
  }
  
  if (process.env.BATCH_SIZE) {
    const batchSize = parseInt(process.env.BATCH_SIZE, 10);
    if (!isNaN(batchSize) && batchSize > 0) {
      config.batchSize = batchSize;
    }
  }
  
  if (process.env.PROGRESS_REPORT_INTERVAL) {
    const interval = parseInt(process.env.PROGRESS_REPORT_INTERVAL, 10);
    if (!isNaN(interval) && interval > 0) {
      config.progressReportInterval = interval;
    }
  }
  
  if (process.env.COORDINATE_TOLERANCE) {
    const tolerance = parseFloat(process.env.COORDINATE_TOLERANCE);
    if (!isNaN(tolerance) && tolerance > 0) {
      config.duplicateDetection.coordinateTolerance = tolerance;
    }
  }
  
  if (process.env.TIMESTAMP_TOLERANCE) {
    const tolerance = parseInt(process.env.TIMESTAMP_TOLERANCE, 10);
    if (!isNaN(tolerance) && tolerance > 0) {
      config.duplicateDetection.timestampTolerance = tolerance * 1000; // Convert to milliseconds
    }
  }
  
  if (process.env.ENABLE_FILE_HASH_CHECK !== undefined) {
    config.duplicateDetection.enableFileHashCheck = process.env.ENABLE_FILE_HASH_CHECK === 'true';
  }
  
  if (process.env.ENABLE_BOUNDS_CHECK !== undefined) {
    config.gpsValidation.enableBoundsCheck = process.env.ENABLE_BOUNDS_CHECK === 'true';
  }
  
  if (process.env.USE_FILE_TIMESTAMP_FALLBACK !== undefined) {
    config.exif.useFileTimestampFallback = process.env.USE_FILE_TIMESTAMP_FALLBACK === 'true';
  }
  
  // Apply custom configuration overrides
  return mergeConfig(config, customConfig);
}

/**
 * Deep merge configuration objects
 * @param {Object} target - Target configuration object
 * @param {Object} source - Source configuration object
 * @returns {Object} Merged configuration object
 */
function mergeConfig(target, source) {
  const result = { ...target };
  
  for (const [key, value] of Object.entries(source)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = mergeConfig(result[key] || {}, value);
    } else {
      result[key] = value;
    }
  }
  
  return result;
}

/**
 * Validate configuration object
 * @param {Object} config - Configuration object to validate
 * @returns {Array} Array of validation errors (empty if valid)
 */
export function validateConfig(config) {
  const errors = [];
  
  // Validate batch size
  if (!Number.isInteger(config.batchSize) || config.batchSize <= 0) {
    errors.push('batchSize must be a positive integer');
  }
  
  // Validate progress report interval
  if (!Number.isInteger(config.progressReportInterval) || config.progressReportInterval <= 0) {
    errors.push('progressReportInterval must be a positive integer');
  }
  
  // Validate coordinate tolerance
  if (typeof config.duplicateDetection.coordinateTolerance !== 'number' || 
      config.duplicateDetection.coordinateTolerance <= 0) {
    errors.push('duplicateDetection.coordinateTolerance must be a positive number');
  }
  
  // Validate timestamp tolerance
  if (!Number.isInteger(config.duplicateDetection.timestampTolerance) || 
      config.duplicateDetection.timestampTolerance <= 0) {
    errors.push('duplicateDetection.timestampTolerance must be a positive integer');
  }
  
  // Validate GPS bounds
  const { gpsValidation } = config;
  if (gpsValidation.minLatitude < -90 || gpsValidation.minLatitude > 90) {
    errors.push('gpsValidation.minLatitude must be between -90 and 90');
  }
  
  if (gpsValidation.maxLatitude < -90 || gpsValidation.maxLatitude > 90) {
    errors.push('gpsValidation.maxLatitude must be between -90 and 90');
  }
  
  if (gpsValidation.minLongitude < -180 || gpsValidation.minLongitude > 180) {
    errors.push('gpsValidation.minLongitude must be between -180 and 180');
  }
  
  if (gpsValidation.maxLongitude < -180 || gpsValidation.maxLongitude > 180) {
    errors.push('gpsValidation.maxLongitude must be between -180 and 180');
  }
  
  if (gpsValidation.minLatitude >= gpsValidation.maxLatitude) {
    errors.push('gpsValidation.minLatitude must be less than maxLatitude');
  }
  
  if (gpsValidation.minLongitude >= gpsValidation.maxLongitude) {
    errors.push('gpsValidation.minLongitude must be less than maxLongitude');
  }
  
  return errors;
}

/**
 * Get configuration summary for logging
 * @param {Object} config - Configuration object
 * @returns {Object} Configuration summary
 */
export function getConfigSummary(config) {
  return {
    scanDirectory: config.defaultScanDirectory,
    batchSize: config.batchSize,
    progressInterval: config.progressReportInterval,
    duplicateDetection: {
      coordinateTolerance: config.duplicateDetection.coordinateTolerance,
      timestampTolerance: `${config.duplicateDetection.timestampTolerance / 1000}s`,
      fileHashCheck: config.duplicateDetection.enableFileHashCheck
    },
    gpsValidation: {
      boundsCheck: config.gpsValidation.enableBoundsCheck,
      latitudeRange: `${config.gpsValidation.minLatitude} to ${config.gpsValidation.maxLatitude}`,
      longitudeRange: `${config.gpsValidation.minLongitude} to ${config.gpsValidation.maxLongitude}`
    },
    exif: {
      fileTimestampFallback: config.exif.useFileTimestampFallback,
      multiFormatSupport: config.exif.enableMultiFormatSupport
    }
  };
}