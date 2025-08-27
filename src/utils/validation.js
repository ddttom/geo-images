/**
 * Validation Utility
 * 
 * Provides validation functions for GPS coordinates, duplicate detection,
 * dataset validation, and data integrity checks for geo scanning operations.
 * 
 * @author Tom Cranstoun <ddttom@github.com>
 */

import { validateCoordinates, coordinatesEqual } from './coordinates.js';

/**
 * Validate GPS coordinates against geographic bounds
 * @param {number} latitude - Latitude coordinate
 * @param {number} longitude - Longitude coordinate
 * @param {Object} bounds - GPS validation bounds
 * @param {number} bounds.minLatitude - Minimum latitude
 * @param {number} bounds.maxLatitude - Maximum latitude
 * @param {number} bounds.minLongitude - Minimum longitude
 * @param {number} bounds.maxLongitude - Maximum longitude
 * @param {boolean} bounds.enableBoundsCheck - Whether to enable bounds checking
 * @returns {boolean} True if coordinates are valid
 */
export function validateGPSCoordinates(latitude, longitude, bounds) {
  if (!bounds.enableBoundsCheck) {
    return validateCoordinates(latitude, longitude);
  }
  
  // Basic coordinate validation
  if (!validateCoordinates(latitude, longitude)) {
    return false;
  }
  
  // Extended bounds checking
  return latitude >= bounds.minLatitude && 
         latitude <= bounds.maxLatitude &&
         longitude >= bounds.minLongitude && 
         longitude <= bounds.maxLongitude;
}

/**
 * Check if a new entry is a duplicate based on multiple criteria
 * @param {Object} newEntry - New GPS entry to check
 * @param {Array} existingEntries - Array of existing GPS entries
 * @param {Object} tolerances - Duplicate detection tolerances
 * @param {number} tolerances.coordinateTolerance - Coordinate tolerance in degrees
 * @param {number} tolerances.timestampTolerance - Timestamp tolerance in milliseconds
 * @returns {boolean} True if entry is a duplicate
 */
export function isDuplicate(newEntry, existingEntries, tolerances) {
  const { coordinateTolerance, timestampTolerance } = tolerances;
  
  return existingEntries.some(existing => {
    // Check coordinate proximity
    const coordsMatch = coordinatesEqual(
      { latitude: newEntry.latitude, longitude: newEntry.longitude },
      { latitude: existing.latitude, longitude: existing.longitude },
      coordinateTolerance
    );
    
    // Check timestamp proximity
    const newTime = new Date(newEntry.timestamp);
    const existingTime = new Date(existing.timestamp);
    const timeDiff = Math.abs(newTime.getTime() - existingTime.getTime());
    const timeMatch = timeDiff <= timestampTolerance;
    
    // Check exact source match (same file path)
    const sourceMatch = newEntry.source === existing.source;
    
    return coordsMatch && (timeMatch || sourceMatch);
  });
}

/**
 * Validate final dataset against JSON schema structure
 * @param {Array} data - Dataset to validate
 * @param {Object} bounds - GPS validation bounds (optional)
 * @returns {Object} Validation result with errors array
 */
export function validateDataset(data, bounds = null) {
  const requiredFields = ['timestamp', 'latitude', 'longitude', 'source', 'accuracy'];
  const errors = [];
  const warnings = [];
  
  if (!Array.isArray(data)) {
    errors.push('Dataset must be an array');
    return { isValid: false, errors, warnings };
  }
  
  for (let i = 0; i < data.length; i++) {
    const entry = data[i];
    const entryPrefix = `Entry ${i}`;
    
    // Check required fields
    for (const field of requiredFields) {
      if (entry[field] === undefined || entry[field] === null) {
        errors.push(`${entryPrefix}: Missing required field '${field}'`);
      }
    }
    
    // Validate data types
    if (typeof entry.latitude !== 'number' || typeof entry.longitude !== 'number') {
      errors.push(`${entryPrefix}: Coordinates must be numbers`);
    }
    
    if (typeof entry.accuracy !== 'number') {
      errors.push(`${entryPrefix}: Accuracy must be a number`);
    }
    
    // Validate timestamp format
    if (entry.timestamp && isNaN(Date.parse(entry.timestamp))) {
      errors.push(`${entryPrefix}: Invalid timestamp format`);
    }
    
    // Validate coordinates
    if (typeof entry.latitude === 'number' && typeof entry.longitude === 'number') {
      if (bounds) {
        if (!validateGPSCoordinates(entry.latitude, entry.longitude, bounds)) {
          errors.push(`${entryPrefix}: Invalid GPS coordinates`);
        }
      } else {
        if (!validateCoordinates(entry.latitude, entry.longitude)) {
          errors.push(`${entryPrefix}: Invalid GPS coordinates`);
        }
      }
    }
    
    // Validate source field
    if (typeof entry.source !== 'string' || entry.source.trim() === '') {
      errors.push(`${entryPrefix}: Source must be a non-empty string`);
    }
    
    // Validate accuracy range
    if (typeof entry.accuracy === 'number' && (entry.accuracy < 0 || entry.accuracy > 100)) {
      warnings.push(`${entryPrefix}: Accuracy value ${entry.accuracy} is outside typical range (0-100)`);
    }
    
    // Check for suspicious coordinates (null island, etc.)
    if (entry.latitude === 0 && entry.longitude === 0) {
      warnings.push(`${entryPrefix}: Coordinates at null island (0,0) - may be placeholder data`);
    }
    
    // Validate optional fields if present
    if (entry.confidence !== undefined) {
      if (typeof entry.confidence !== 'number' || entry.confidence < 0 || entry.confidence > 1) {
        errors.push(`${entryPrefix}: Confidence must be a number between 0 and 1`);
      }
    }
    
    if (entry.filePath !== undefined) {
      if (typeof entry.filePath !== 'string' || entry.filePath.trim() === '') {
        errors.push(`${entryPrefix}: FilePath must be a non-empty string`);
      }
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    entryCount: data.length
  };
}

/**
 * Validate GPS entry structure
 * @param {Object} entry - GPS entry to validate
 * @returns {Object} Validation result
 */
export function validateGPSEntry(entry) {
  const errors = [];
  const warnings = [];
  
  if (!entry || typeof entry !== 'object') {
    errors.push('Entry must be an object');
    return { isValid: false, errors, warnings };
  }
  
  // Required fields validation
  const requiredFields = ['timestamp', 'latitude', 'longitude', 'source', 'accuracy'];
  for (const field of requiredFields) {
    if (entry[field] === undefined || entry[field] === null) {
      errors.push(`Missing required field: ${field}`);
    }
  }
  
  // Type validation
  if (entry.latitude !== undefined && typeof entry.latitude !== 'number') {
    errors.push('Latitude must be a number');
  }
  
  if (entry.longitude !== undefined && typeof entry.longitude !== 'number') {
    errors.push('Longitude must be a number');
  }
  
  if (entry.accuracy !== undefined && typeof entry.accuracy !== 'number') {
    errors.push('Accuracy must be a number');
  }
  
  if (entry.source !== undefined && typeof entry.source !== 'string') {
    errors.push('Source must be a string');
  }
  
  // Coordinate validation
  if (typeof entry.latitude === 'number' && typeof entry.longitude === 'number') {
    if (!validateCoordinates(entry.latitude, entry.longitude)) {
      errors.push('Invalid GPS coordinates');
    }
  }
  
  // Timestamp validation
  if (entry.timestamp && isNaN(Date.parse(entry.timestamp))) {
    errors.push('Invalid timestamp format');
  }
  
  // Range validations
  if (typeof entry.accuracy === 'number' && entry.accuracy < 0) {
    errors.push('Accuracy cannot be negative');
  }
  
  if (entry.confidence !== undefined) {
    if (typeof entry.confidence !== 'number' || entry.confidence < 0 || entry.confidence > 1) {
      errors.push('Confidence must be a number between 0 and 1');
    }
  }
  
  // Warnings for suspicious data
  if (entry.latitude === 0 && entry.longitude === 0) {
    warnings.push('Coordinates at null island (0,0) - may be placeholder data');
  }
  
  if (typeof entry.accuracy === 'number' && entry.accuracy > 1000) {
    warnings.push(`High accuracy value (${entry.accuracy}m) - may indicate low precision`);
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Check for duplicate entries in a dataset
 * @param {Array} data - Dataset to check for duplicates
 * @param {Object} tolerances - Duplicate detection tolerances
 * @returns {Object} Duplicate analysis result
 */
export function findDuplicates(data, tolerances) {
  const duplicates = [];
  const uniqueEntries = [];
  const processedEntries = new Set();
  
  for (let i = 0; i < data.length; i++) {
    const entry = data[i];
    const entryKey = `${entry.latitude}_${entry.longitude}_${entry.timestamp}_${entry.source}`;
    
    // Check for exact duplicates first
    if (processedEntries.has(entryKey)) {
      duplicates.push({
        index: i,
        entry,
        reason: 'exact_duplicate',
        duplicateOf: uniqueEntries.findIndex(e => 
          e.latitude === entry.latitude &&
          e.longitude === entry.longitude &&
          e.timestamp === entry.timestamp &&
          e.source === entry.source
        )
      });
      continue;
    }
    
    // Check for approximate duplicates
    const isDuplicateEntry = isDuplicate(entry, uniqueEntries, tolerances);
    
    if (isDuplicateEntry) {
      const duplicateIndex = uniqueEntries.findIndex(existing => 
        isDuplicate(entry, [existing], tolerances)
      );
      
      duplicates.push({
        index: i,
        entry,
        reason: 'approximate_duplicate',
        duplicateOf: duplicateIndex
      });
    } else {
      uniqueEntries.push(entry);
      processedEntries.add(entryKey);
    }
  }
  
  return {
    totalEntries: data.length,
    uniqueEntries: uniqueEntries.length,
    duplicateCount: duplicates.length,
    duplicates,
    duplicateRate: data.length > 0 ? (duplicates.length / data.length * 100).toFixed(1) : 0
  };
}

/**
 * Validate configuration object for validation settings
 * @param {Object} config - Configuration object
 * @returns {Object} Validation result
 */
export function validateValidationConfig(config) {
  const errors = [];
  
  if (!config || typeof config !== 'object') {
    errors.push('Configuration must be an object');
    return { isValid: false, errors };
  }
  
  // Validate duplicate detection settings
  if (config.duplicateDetection) {
    const { duplicateDetection } = config;
    
    if (typeof duplicateDetection.coordinateTolerance !== 'number' || 
        duplicateDetection.coordinateTolerance <= 0) {
      errors.push('coordinateTolerance must be a positive number');
    }
    
    if (typeof duplicateDetection.timestampTolerance !== 'number' || 
        duplicateDetection.timestampTolerance <= 0) {
      errors.push('timestampTolerance must be a positive number');
    }
    
    if (typeof duplicateDetection.enableFileHashCheck !== 'boolean') {
      errors.push('enableFileHashCheck must be a boolean');
    }
  }
  
  // Validate GPS validation settings
  if (config.gpsValidation) {
    const { gpsValidation } = config;
    
    if (typeof gpsValidation.enableBoundsCheck !== 'boolean') {
      errors.push('enableBoundsCheck must be a boolean');
    }
    
    const bounds = ['minLatitude', 'maxLatitude', 'minLongitude', 'maxLongitude'];
    for (const bound of bounds) {
      if (typeof gpsValidation[bound] !== 'number') {
        errors.push(`${bound} must be a number`);
      }
    }
    
    if (gpsValidation.minLatitude >= gpsValidation.maxLatitude) {
      errors.push('minLatitude must be less than maxLatitude');
    }
    
    if (gpsValidation.minLongitude >= gpsValidation.maxLongitude) {
      errors.push('minLongitude must be less than maxLongitude');
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Sanitize GPS entry by removing invalid or suspicious data
 * @param {Object} entry - GPS entry to sanitize
 * @param {Object} options - Sanitization options
 * @returns {Object} Sanitized entry or null if entry should be discarded
 */
export function sanitizeGPSEntry(entry, options = {}) {
  const {
    removeNullIsland = true,
    maxAccuracy = 10000, // 10km
    requireTimestamp = true,
    requireSource = true
  } = options;
  
  if (!entry || typeof entry !== 'object') {
    return null;
  }
  
  const sanitized = { ...entry };
  
  // Remove null island coordinates if requested
  if (removeNullIsland && sanitized.latitude === 0 && sanitized.longitude === 0) {
    return null;
  }
  
  // Validate coordinates
  if (!validateCoordinates(sanitized.latitude, sanitized.longitude)) {
    return null;
  }
  
  // Check accuracy threshold
  if (typeof sanitized.accuracy === 'number' && sanitized.accuracy > maxAccuracy) {
    return null;
  }
  
  // Require timestamp if specified
  if (requireTimestamp && (!sanitized.timestamp || isNaN(Date.parse(sanitized.timestamp)))) {
    return null;
  }
  
  // Require source if specified
  if (requireSource && (!sanitized.source || typeof sanitized.source !== 'string' || sanitized.source.trim() === '')) {
    return null;
  }
  
  // Normalize timestamp format
  if (sanitized.timestamp) {
    try {
      sanitized.timestamp = new Date(sanitized.timestamp).toISOString();
    } catch (error) {
      return null;
    }
  }
  
  // Ensure accuracy is positive
  if (typeof sanitized.accuracy === 'number' && sanitized.accuracy < 0) {
    sanitized.accuracy = Math.abs(sanitized.accuracy);
  }
  
  // Clamp confidence to valid range
  if (typeof sanitized.confidence === 'number') {
    sanitized.confidence = Math.max(0, Math.min(1, sanitized.confidence));
  }
  
  return sanitized;
}