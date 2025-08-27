/**
 * Data Processing Utility
 * 
 * Provides data transformation, merging, and processing utilities for
 * geo scanning operations including location data management and batch processing.
 * 
 * @author Tom Cranstoun <ddttom@github.com>
 */

import { validateGPSCoordinates, isDuplicate, validateDataset } from './validation.js';

/**
 * Merge new location data with existing data while preserving integrity
 * @param {Array} existingData - Existing location data
 * @param {Array} newData - New location data to merge
 * @param {Object} options - Merge options
 * @returns {Object} Merge result with final data and statistics
 */
export function mergeLocationData(existingData, newData, options = {}) {
  const {
    sortByTimestamp = true,
    removeDuplicates = true,
    validateCoordinates = true,
    bounds = null,
    tolerances = {
      coordinateTolerance: 0.0001,
      timestampTolerance: 60000
    }
  } = options;

  const statistics = {
    existingEntries: existingData.length,
    newEntries: newData.length,
    duplicatesRemoved: 0,
    invalidEntriesRemoved: 0,
    finalEntries: 0
  };

  // Combine all data
  const combinedData = [...existingData, ...newData];
  
  // Sort chronologically by timestamp if requested
  if (sortByTimestamp) {
    combinedData.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  }
  
  // Process entries for duplicates and validation
  const finalData = [];
  const processedEntries = new Set();
  
  for (const entry of combinedData) {
    // Create unique key for exact duplicate detection
    const entryKey = `${entry.latitude}_${entry.longitude}_${entry.timestamp}_${entry.source}`;
    
    // Skip exact duplicates
    if (processedEntries.has(entryKey)) {
      statistics.duplicatesRemoved++;
      continue;
    }
    
    // Validate coordinates if requested
    if (validateCoordinates) {
      const isValid = bounds 
        ? validateGPSCoordinates(entry.latitude, entry.longitude, bounds)
        : entry.latitude != null && entry.longitude != null && 
          !isNaN(entry.latitude) && !isNaN(entry.longitude);
      
      if (!isValid) {
        statistics.invalidEntriesRemoved++;
        continue;
      }
    }
    
    // Check for approximate duplicates if requested
    if (removeDuplicates && isDuplicate(entry, finalData, tolerances)) {
      statistics.duplicatesRemoved++;
      continue;
    }
    
    // Add valid, unique entry
    finalData.push(entry);
    processedEntries.add(entryKey);
  }
  
  statistics.finalEntries = finalData.length;
  
  return {
    data: finalData,
    statistics
  };
}

/**
 * Process GPS entries in batches for memory efficiency
 * @param {Array} entries - GPS entries to process
 * @param {Function} processor - Processing function for each batch
 * @param {Object} options - Batch processing options
 * @returns {Promise<Object>} Processing results
 */
export async function processBatches(entries, processor, options = {}) {
  const {
    batchSize = 50,
    onProgress = null,
    onBatchComplete = null,
    continueOnError = true
  } = options;

  const results = {
    totalEntries: entries.length,
    processedEntries: 0,
    successfulBatches: 0,
    failedBatches: 0,
    errors: [],
    batchResults: []
  };

  // Split entries into batches
  const batches = [];
  for (let i = 0; i < entries.length; i += batchSize) {
    batches.push(entries.slice(i, i + batchSize));
  }

  // Process each batch
  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex];
    const batchNumber = batchIndex + 1;

    try {
      // Report progress
      if (onProgress) {
        onProgress({
          batchNumber,
          totalBatches: batches.length,
          batchSize: batch.length,
          processedEntries: results.processedEntries
        });
      }

      // Process the batch
      const batchResult = await processor(batch, batchNumber, batches.length);
      
      results.batchResults.push(batchResult);
      results.processedEntries += batch.length;
      results.successfulBatches++;

      // Report batch completion
      if (onBatchComplete) {
        onBatchComplete({
          batchNumber,
          batchResult,
          success: true
        });
      }

    } catch (error) {
      results.failedBatches++;
      results.errors.push({
        batchNumber,
        error: error.message,
        batchSize: batch.length
      });

      // Report batch failure
      if (onBatchComplete) {
        onBatchComplete({
          batchNumber,
          batchResult: null,
          success: false,
          error
        });
      }

      // Stop processing if continueOnError is false
      if (!continueOnError) {
        throw new Error(`Batch processing failed at batch ${batchNumber}: ${error.message}`);
      }
    }
  }

  return results;
}

/**
 * Transform GPS entry to standardized format
 * @param {Object} entry - GPS entry to transform
 * @param {Object} options - Transformation options
 * @returns {Object} Transformed GPS entry
 */
export function transformGPSEntry(entry, options = {}) {
  const {
    includeMetadata = true,
    normalizeTimestamp = true,
    addDefaults = true,
    precision = 6
  } = options;

  if (!entry || typeof entry !== 'object') {
    return null;
  }

  const transformed = {};

  // Core GPS data
  if (typeof entry.latitude === 'number') {
    transformed.latitude = parseFloat(entry.latitude.toFixed(precision));
  }
  
  if (typeof entry.longitude === 'number') {
    transformed.longitude = parseFloat(entry.longitude.toFixed(precision));
  }

  // Timestamp handling
  if (entry.timestamp) {
    if (normalizeTimestamp) {
      try {
        transformed.timestamp = new Date(entry.timestamp).toISOString();
      } catch (error) {
        transformed.timestamp = entry.timestamp;
      }
    } else {
      transformed.timestamp = entry.timestamp;
    }
  }

  // Required fields
  if (entry.source) {
    transformed.source = String(entry.source);
  }

  if (typeof entry.accuracy === 'number') {
    transformed.accuracy = entry.accuracy;
  }

  // Optional metadata
  if (includeMetadata) {
    if (entry.confidence !== undefined) {
      transformed.confidence = entry.confidence;
    }
    
    if (entry.camera) {
      transformed.camera = entry.camera;
    }
    
    if (entry.format) {
      transformed.format = entry.format;
    }
    
    if (entry.filePath) {
      transformed.filePath = entry.filePath;
    }
  }

  // Add defaults if requested
  if (addDefaults) {
    if (transformed.accuracy === undefined) {
      transformed.accuracy = 1; // Default accuracy for EXIF data
    }
    
    if (transformed.confidence === undefined) {
      transformed.confidence = 0.9; // High confidence for EXIF data
    }
  }

  return transformed;
}

/**
 * Filter GPS entries based on criteria
 * @param {Array} entries - GPS entries to filter
 * @param {Object} criteria - Filter criteria
 * @returns {Array} Filtered GPS entries
 */
export function filterGPSEntries(entries, criteria = {}) {
  const {
    minAccuracy = null,
    maxAccuracy = null,
    minConfidence = null,
    sources = null,
    dateRange = null,
    bounds = null,
    excludeNullIsland = true
  } = criteria;

  return entries.filter(entry => {
    // Accuracy filter
    if (minAccuracy !== null && entry.accuracy < minAccuracy) {
      return false;
    }
    
    if (maxAccuracy !== null && entry.accuracy > maxAccuracy) {
      return false;
    }

    // Confidence filter
    if (minConfidence !== null && entry.confidence < minConfidence) {
      return false;
    }

    // Source filter
    if (sources && !sources.includes(entry.source)) {
      return false;
    }

    // Date range filter
    if (dateRange) {
      const entryDate = new Date(entry.timestamp);
      const startDate = new Date(dateRange.start);
      const endDate = new Date(dateRange.end);
      
      if (entryDate < startDate || entryDate > endDate) {
        return false;
      }
    }

    // Geographic bounds filter
    if (bounds) {
      const { north, south, east, west } = bounds;
      
      if (entry.latitude < south || entry.latitude > north) {
        return false;
      }
      
      // Handle longitude bounds (may cross date line)
      if (west <= east) {
        if (entry.longitude < west || entry.longitude > east) {
          return false;
        }
      } else {
        if (entry.longitude < west && entry.longitude > east) {
          return false;
        }
      }
    }

    // Exclude null island
    if (excludeNullIsland && entry.latitude === 0 && entry.longitude === 0) {
      return false;
    }

    return true;
  });
}

/**
 * Group GPS entries by criteria
 * @param {Array} entries - GPS entries to group
 * @param {string|Function} groupBy - Grouping criteria
 * @returns {Object} Grouped entries
 */
export function groupGPSEntries(entries, groupBy) {
  const groups = {};

  entries.forEach(entry => {
    let key;

    if (typeof groupBy === 'function') {
      key = groupBy(entry);
    } else if (typeof groupBy === 'string') {
      switch (groupBy) {
        case 'source':
          key = entry.source;
          break;
        case 'date':
          key = new Date(entry.timestamp).toDateString();
          break;
        case 'month':
          const date = new Date(entry.timestamp);
          key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
          break;
        case 'year':
          key = new Date(entry.timestamp).getFullYear().toString();
          break;
        case 'camera':
          key = entry.camera || 'unknown';
          break;
        default:
          key = entry[groupBy] || 'unknown';
      }
    } else {
      key = 'all';
    }

    if (!groups[key]) {
      groups[key] = [];
    }
    
    groups[key].push(entry);
  });

  return groups;
}

/**
 * Calculate statistics for GPS entries
 * @param {Array} entries - GPS entries to analyze
 * @returns {Object} Statistics object
 */
export function calculateGPSStatistics(entries) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return {
      totalEntries: 0,
      sources: {},
      dateRange: null,
      accuracyStats: null,
      confidenceStats: null,
      geographicBounds: null
    };
  }

  const stats = {
    totalEntries: entries.length,
    sources: {},
    dateRange: {
      earliest: null,
      latest: null,
      span: null
    },
    accuracyStats: {
      min: Infinity,
      max: -Infinity,
      average: 0,
      median: 0
    },
    confidenceStats: {
      min: Infinity,
      max: -Infinity,
      average: 0,
      median: 0
    },
    geographicBounds: {
      north: -Infinity,
      south: Infinity,
      east: -Infinity,
      west: Infinity
    }
  };

  const timestamps = [];
  const accuracies = [];
  const confidences = [];

  entries.forEach(entry => {
    // Source statistics
    if (entry.source) {
      stats.sources[entry.source] = (stats.sources[entry.source] || 0) + 1;
    }

    // Date statistics
    if (entry.timestamp) {
      const date = new Date(entry.timestamp);
      timestamps.push(date);
      
      if (!stats.dateRange.earliest || date < stats.dateRange.earliest) {
        stats.dateRange.earliest = date;
      }
      
      if (!stats.dateRange.latest || date > stats.dateRange.latest) {
        stats.dateRange.latest = date;
      }
    }

    // Accuracy statistics
    if (typeof entry.accuracy === 'number') {
      accuracies.push(entry.accuracy);
      stats.accuracyStats.min = Math.min(stats.accuracyStats.min, entry.accuracy);
      stats.accuracyStats.max = Math.max(stats.accuracyStats.max, entry.accuracy);
    }

    // Confidence statistics
    if (typeof entry.confidence === 'number') {
      confidences.push(entry.confidence);
      stats.confidenceStats.min = Math.min(stats.confidenceStats.min, entry.confidence);
      stats.confidenceStats.max = Math.max(stats.confidenceStats.max, entry.confidence);
    }

    // Geographic bounds
    if (typeof entry.latitude === 'number' && typeof entry.longitude === 'number') {
      stats.geographicBounds.north = Math.max(stats.geographicBounds.north, entry.latitude);
      stats.geographicBounds.south = Math.min(stats.geographicBounds.south, entry.latitude);
      stats.geographicBounds.east = Math.max(stats.geographicBounds.east, entry.longitude);
      stats.geographicBounds.west = Math.min(stats.geographicBounds.west, entry.longitude);
    }
  });

  // Calculate date range span
  if (stats.dateRange.earliest && stats.dateRange.latest) {
    stats.dateRange.span = stats.dateRange.latest - stats.dateRange.earliest;
  }

  // Calculate accuracy statistics
  if (accuracies.length > 0) {
    stats.accuracyStats.average = accuracies.reduce((sum, acc) => sum + acc, 0) / accuracies.length;
    accuracies.sort((a, b) => a - b);
    const mid = Math.floor(accuracies.length / 2);
    stats.accuracyStats.median = accuracies.length % 2 === 0 
      ? (accuracies[mid - 1] + accuracies[mid]) / 2 
      : accuracies[mid];
  } else {
    stats.accuracyStats = null;
  }

  // Calculate confidence statistics
  if (confidences.length > 0) {
    stats.confidenceStats.average = confidences.reduce((sum, conf) => sum + conf, 0) / confidences.length;
    confidences.sort((a, b) => a - b);
    const mid = Math.floor(confidences.length / 2);
    stats.confidenceStats.median = confidences.length % 2 === 0 
      ? (confidences[mid - 1] + confidences[mid]) / 2 
      : confidences[mid];
  } else {
    stats.confidenceStats = null;
  }

  // Reset infinite values if no valid data
  if (stats.geographicBounds.north === -Infinity) {
    stats.geographicBounds = null;
  }

  return stats;
}

/**
 * Export GPS entries to various formats
 * @param {Array} entries - GPS entries to export
 * @param {string} format - Export format ('json', 'csv', 'geojson')
 * @param {Object} options - Export options
 * @returns {string} Exported data as string
 */
export function exportGPSEntries(entries, format = 'json', options = {}) {
  const {
    indent = 2,
    includeHeaders = true,
    precision = 6
  } = options;

  switch (format.toLowerCase()) {
    case 'json':
      return JSON.stringify(entries, null, indent);

    case 'csv':
      if (entries.length === 0) {
        return '';
      }

      const headers = ['timestamp', 'latitude', 'longitude', 'source', 'accuracy', 'confidence'];
      const csvLines = [];

      if (includeHeaders) {
        csvLines.push(headers.join(','));
      }

      entries.forEach(entry => {
        const row = headers.map(header => {
          const value = entry[header];
          if (value === undefined || value === null) {
            return '';
          }
          if (typeof value === 'number') {
            return header === 'latitude' || header === 'longitude' 
              ? value.toFixed(precision) 
              : value;
          }
          return `"${String(value).replace(/"/g, '""')}"`;
        });
        csvLines.push(row.join(','));
      });

      return csvLines.join('\n');

    case 'geojson':
      const features = entries.map(entry => ({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [
            parseFloat(entry.longitude.toFixed(precision)),
            parseFloat(entry.latitude.toFixed(precision))
          ]
        },
        properties: {
          timestamp: entry.timestamp,
          source: entry.source,
          accuracy: entry.accuracy,
          confidence: entry.confidence,
          ...(entry.camera && { camera: entry.camera }),
          ...(entry.format && { format: entry.format }),
          ...(entry.filePath && { filePath: entry.filePath })
        }
      }));

      return JSON.stringify({
        type: 'FeatureCollection',
        features
      }, null, indent);

    default:
      throw new Error(`Unsupported export format: ${format}`);
  }
}

/**
 * Deduplicate GPS entries using multiple strategies
 * @param {Array} entries - GPS entries to deduplicate
 * @param {Object} options - Deduplication options
 * @returns {Object} Deduplication result
 */
export function deduplicateGPSEntries(entries, options = {}) {
  const {
    strategy = 'comprehensive', // 'exact', 'coordinate', 'comprehensive'
    tolerances = {
      coordinateTolerance: 0.0001,
      timestampTolerance: 60000
    },
    keepBest = true // Keep entry with highest accuracy/confidence
  } = options;

  const result = {
    originalCount: entries.length,
    uniqueEntries: [],
    duplicatesRemoved: 0,
    duplicateGroups: []
  };

  if (entries.length === 0) {
    return result;
  }

  const processed = new Set();
  const duplicateGroups = [];

  entries.forEach((entry, index) => {
    if (processed.has(index)) {
      return;
    }

    const group = [{ entry, index }];
    processed.add(index);

    // Find duplicates of this entry
    for (let i = index + 1; i < entries.length; i++) {
      if (processed.has(i)) {
        continue;
      }

      const otherEntry = entries[i];
      let isDupe = false;

      switch (strategy) {
        case 'exact':
          isDupe = (
            entry.latitude === otherEntry.latitude &&
            entry.longitude === otherEntry.longitude &&
            entry.timestamp === otherEntry.timestamp &&
            entry.source === otherEntry.source
          );
          break;

        case 'coordinate':
          isDupe = Math.abs(entry.latitude - otherEntry.latitude) <= tolerances.coordinateTolerance &&
                   Math.abs(entry.longitude - otherEntry.longitude) <= tolerances.coordinateTolerance;
          break;

        case 'comprehensive':
          isDupe = isDuplicate(entry, [otherEntry], tolerances);
          break;
      }

      if (isDupe) {
        group.push({ entry: otherEntry, index: i });
        processed.add(i);
      }
    }

    if (group.length > 1) {
      duplicateGroups.push(group);
      result.duplicatesRemoved += group.length - 1;

      // Keep the best entry from the group
      if (keepBest) {
        const bestEntry = group.reduce((best, current) => {
          const bestScore = (best.entry.accuracy || 0) + (best.entry.confidence || 0);
          const currentScore = (current.entry.accuracy || 0) + (current.entry.confidence || 0);
          return currentScore > bestScore ? current : best;
        });
        result.uniqueEntries.push(bestEntry.entry);
      } else {
        // Keep the first entry
        result.uniqueEntries.push(group[0].entry);
      }
    } else {
      result.uniqueEntries.push(entry);
    }
  });

  result.duplicateGroups = duplicateGroups;
  return result;
}