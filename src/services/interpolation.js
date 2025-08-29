/**
 * Interpolation Service
 * 
 * Handles GPS coordinate interpolation using timeline data and nearby geotagged images.
 * Implements multiple fallback strategies for maximum coverage.
 * 
 * @author Tom Cranstoun <ddttom@github.com>
 */

import { calculateDistance } from '../utils/distance.js';
import { validateCoordinates } from '../utils/coordinates.js';
import { getCameraOrOriginalSource } from '../utils/cameraSource.js';

/**
 * Service for GPS coordinate interpolation
 */
class InterpolationService {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
    this.timelineParser = null;
    this.geolocationDb = null;
    this.nearbyImages = new Map();
  }

  /**
   * Set timeline parser reference
   * @param {TimelineParserService} timelineParser - Timeline parser instance
   */
  setTimelineParser(timelineParser) {
    this.timelineParser = timelineParser;
  }

  /**
   * Set geolocation database reference
   * @param {GeolocationDatabaseService} geolocationDb - Geolocation database instance
   */
  setGeolocationDatabase(geolocationDb) {
    this.geolocationDb = geolocationDb;
  }

  /**
   * Add nearby image with GPS data for cross-referencing
   * @param {string} filePath - Image file path
   * @param {Object} gpsData - GPS coordinates
   * @param {Date} timestamp - Image timestamp
   */
  addNearbyImage(filePath, gpsData, timestamp) {
    if (!timestamp || !gpsData.latitude || !gpsData.longitude) return;
    
    const timestampMs = timestamp.getTime();
    this.nearbyImages.set(timestampMs, {
      filePath,
      latitude: gpsData.latitude,
      longitude: gpsData.longitude,
      timestamp
    });
  }

  /**
   * Interpolate GPS coordinates for a given timestamp
   * @param {Date} timestamp - Target timestamp
   * @param {string} filePath - File path for logging
   * @returns {Promise<Object|null>} GPS coordinates or null
   */
  async interpolateCoordinates(timestamp, filePath) {
    if (!timestamp) {
      const errorMsg = `No timestamp available for ${filePath} - GPS processing skipped`;
      this.logger.error(errorMsg, {
        filePath,
        timestamp: null,
        stage: 'timestamp_validation'
      });
      throw new Error('Missing timestamp - GPS processing requires valid image timestamp');
    }

    this.logger.debug(`Interpolating coordinates for ${filePath} at ${timestamp.toISOString()}`, {
      filePath,
      timestamp: timestamp.toISOString(),
      stage: 'interpolation_start'
    });

    // Priority chain: Database → EXIF → Timeline → Nearby Images → Enhanced Fallback
    let result = null;

    // 1. Check geolocation database first (cached data)
    if (this.geolocationDb) {
      result = await this.geolocationDb.getCoordinates(filePath);
      if (result) {
        this.logger.debug(`Found cached coordinates for ${filePath}`);
        return result;
      }
    }

    // 2. Direct EXIF extraction check (existing GPS data)
    if (!result) {
      try {
        // We need to import the EXIF service dynamically to avoid circular dependencies
        const ExifService = (await import('./exif.js')).default;
        const exifService = new ExifService(this.logger);
        
        const exifData = await exifService.extractMetadata(filePath);
        if (exifData.hasGPS && exifData.latitude && exifData.longitude) {
          result = {
            latitude: exifData.latitude,
            longitude: exifData.longitude,
            source: getCameraOrOriginalSource(exifData.camera, 'image_exif'),
            method: 'direct',
            confidence: 1.0, // High confidence for existing EXIF data
            accuracy: null
          };
          this.logger.debug(`Found existing GPS data in EXIF for ${filePath}`);
          return result;
        }
      } catch (error) {
        this.logger.debug(`EXIF extraction failed for ${filePath}: ${error.message}`);
      }
    }

    // 3. Timeline interpolation (primary method)
    result = this.interpolateFromTimeline(timestamp);
    if (result) {
      this.logger.debug(`Timeline interpolation successful for ${filePath}`);
      return {
        ...result,
        source: 'timeline_interpolation',
        method: 'primary'
      };
    }

    // 4. Nearby images cross-referencing
    result = this.interpolateFromNearbyImages(timestamp);
    if (result) {
      this.logger.debug(`Nearby image interpolation successful for ${filePath}`);
      return {
        ...result,
        source: 'nearby_images',
        method: 'cross_reference'
      };
    }

    // 5. Enhanced fallback with progressive search
    if (this.config.enhancedFallback?.enabled) {
      result = this.enhancedFallbackInterpolation(timestamp);
      if (result) {
        this.logger.debug(`Enhanced fallback successful for ${filePath}`);
        return {
          ...result,
          source: 'enhanced_fallback',
          method: 'fallback'
        };
      }
    }

    // Log detailed failure analysis
    this.logger.error(`No coordinates found for ${filePath} - all interpolation methods failed`, {
      filePath,
      timestamp: timestamp.toISOString(),
      stage: 'interpolation_complete_failure',
      attemptedMethods: {
        database: !!this.geolocationDb,
        timeline: !!this.timelineParser,
        nearbyImages: this.nearbyImages.size,
        enhancedFallback: this.config.enhancedFallback?.enabled
      },
      timelineStats: this.timelineParser ? {
        totalRecords: this.timelineParser.getLocationDataArray().length,
        hasData: this.timelineParser.getLocationDataArray().length > 0
      } : null
    });
    
    return null;
  }

  /**
   * Interpolate coordinates from timeline data
   * @param {Date} timestamp - Target timestamp
   * @returns {Object|null} GPS coordinates or null
   */
  interpolateFromTimeline(timestamp) {
    if (!this.timelineParser) return null;

    const tolerance = this.config.timelineTolerance || 60;
    const result = this.timelineParser.findCoordinatesForTimestamp(timestamp, tolerance);

    if (result && this.validateResult(result)) {
      return {
        latitude: result.latitude,
        longitude: result.longitude,
        accuracy: result.accuracy,
        timeDifference: result.timeDifference,
        confidence: this.calculateConfidence(result.timeDifference, result.accuracy)
      };
    }

    return null;
  }

  /**
   * Interpolate coordinates from nearby geotagged images
   * @param {Date} timestamp - Target timestamp
   * @returns {Object|null} GPS coordinates or null
   */
  interpolateFromNearbyImages(timestamp) {
    if (this.nearbyImages.size === 0) return null;

    const targetMs = timestamp.getTime();
    const maxTimeDifference = 6 * 60 * 60 * 1000; // 6 hours in milliseconds

    let bestMatch = null;
    let bestScore = 0;

    // Find the best nearby image based on time proximity
    for (const [imageTimestamp, imageData] of this.nearbyImages) {
      const timeDifference = Math.abs(imageTimestamp - targetMs);
      
      if (timeDifference <= maxTimeDifference) {
        // Score based on time proximity (closer = higher score)
        const timeScore = 1 - (timeDifference / maxTimeDifference);
        
        if (timeScore > bestScore) {
          bestMatch = {
            latitude: imageData.latitude,
            longitude: imageData.longitude,
            timeDifference: timeDifference / 1000 / 60, // minutes
            sourceImage: imageData.filePath
          };
          bestScore = timeScore;
        }
      }
    }

    if (bestMatch && this.validateResult(bestMatch)) {
      return {
        ...bestMatch,
        confidence: bestScore
      };
    }

    return null;
  }

  /**
   * Enhanced fallback interpolation with progressive search
   * @param {Date} timestamp - Target timestamp
   * @returns {Object|null} GPS coordinates or null
   */
  enhancedFallbackInterpolation(timestamp) {
    if (!this.timelineParser) return null;

    const fallbackConfig = this.config.enhancedFallback;
    const result = this.timelineParser.findCoordinatesWithFallback(timestamp, fallbackConfig);

    if (result && this.validateResult(result)) {
      return {
        latitude: result.latitude,
        longitude: result.longitude,
        accuracy: result.accuracy,
        timeDifference: result.timeDifference,
        confidence: this.calculateFallbackConfidence(result.timeDifference, result.accuracy)
      };
    }

    return null;
  }

  /**
   * Spatial interpolation between two GPS points
   * @param {Object} point1 - First GPS point with timestamp
   * @param {Object} point2 - Second GPS point with timestamp
   * @param {Date} targetTimestamp - Target timestamp
   * @returns {Object|null} Interpolated coordinates
   */
  spatialInterpolation(point1, point2, targetTimestamp) {
    if (!point1 || !point2 || !targetTimestamp) return null;

    const targetMs = targetTimestamp.getTime();
    const time1 = new Date(point1.timestamp).getTime();
    const time2 = new Date(point2.timestamp).getTime();

    // Ensure target is between the two points
    if (targetMs < Math.min(time1, time2) || targetMs > Math.max(time1, time2)) {
      return null;
    }

    // Calculate interpolation ratio
    const totalTime = Math.abs(time2 - time1);
    const targetTime = Math.abs(targetMs - time1);
    const ratio = totalTime > 0 ? targetTime / totalTime : 0;

    // Linear interpolation
    const lat1 = point1.latitude;
    const lon1 = point1.longitude;
    const lat2 = point2.latitude;
    const lon2 = point2.longitude;

    const interpolatedLat = lat1 + (lat2 - lat1) * ratio;
    const interpolatedLon = lon1 + (lon2 - lon1) * ratio;

    // Validate interpolated coordinates
    if (!validateCoordinates(interpolatedLat, interpolatedLon)) {
      return null;
    }

    // Calculate confidence based on distance and time
    const distance = calculateDistance(lat1, lon1, lat2, lon2);
    const timeSpan = totalTime / 1000 / 60; // minutes
    
    return {
      latitude: interpolatedLat,
      longitude: interpolatedLon,
      confidence: this.calculateSpatialConfidence(distance, timeSpan),
      interpolationDistance: distance,
      interpolationTimeSpan: timeSpan
    };
  }

  /**
   * Find bracketing GPS points for spatial interpolation
   * @param {Date} timestamp - Target timestamp
   * @param {number} maxTimeSpan - Maximum time span in minutes
   * @returns {Object|null} Bracketing points or null
   */
  findBracketingPoints(timestamp, maxTimeSpan = 120) {
    if (!this.timelineParser) return null;

    const targetMs = timestamp.getTime();
    const maxSpanMs = maxTimeSpan * 60 * 1000;

    let beforePoint = null;
    let afterPoint = null;
    let beforeDistance = Infinity;
    let afterDistance = Infinity;

    // Search through timeline data
    const locationData = this.timelineParser.getLocationDataArray();
    
    for (const record of locationData) {
      const recordMs = new Date(record.timestamp).getTime();
      const timeDiff = recordMs - targetMs;

      if (timeDiff < 0 && Math.abs(timeDiff) < beforeDistance && Math.abs(timeDiff) <= maxSpanMs) {
        // Point before target
        beforePoint = record;
        beforeDistance = Math.abs(timeDiff);
      } else if (timeDiff > 0 && timeDiff < afterDistance && timeDiff <= maxSpanMs) {
        // Point after target
        afterPoint = record;
        afterDistance = timeDiff;
      }
    }

    if (beforePoint && afterPoint) {
      return { before: beforePoint, after: afterPoint };
    }

    return null;
  }

  /**
   * Calculate confidence score based on time difference and accuracy
   * @param {number} timeDifferenceMinutes - Time difference in minutes
   * @param {number} accuracy - GPS accuracy in meters
   * @returns {number} Confidence score (0-1)
   */
  calculateConfidence(timeDifferenceMinutes, accuracy) {
    // Time confidence (closer = higher confidence)
    const timeConfidence = Math.max(0, 1 - (timeDifferenceMinutes / 60));
    
    // Accuracy confidence (more accurate = higher confidence)
    let accuracyConfidence = 1;
    if (accuracy) {
      accuracyConfidence = Math.max(0, 1 - (accuracy / 100));
    }
    
    // Combined confidence
    return (timeConfidence + accuracyConfidence) / 2;
  }

  /**
   * Calculate fallback confidence score
   * @param {number} timeDifferenceMinutes - Time difference in minutes
   * @param {number} accuracy - GPS accuracy in meters
   * @returns {number} Confidence score (0-1)
   */
  calculateFallbackConfidence(timeDifferenceMinutes, accuracy) {
    // Lower base confidence for fallback methods
    const baseConfidence = this.calculateConfidence(timeDifferenceMinutes, accuracy);
    return Math.max(0.1, baseConfidence * 0.7);
  }

  /**
   * Calculate spatial interpolation confidence
   * @param {number} distance - Distance between points in meters
   * @param {number} timeSpan - Time span in minutes
   * @returns {number} Confidence score (0-1)
   */
  calculateSpatialConfidence(distance, timeSpan) {
    // Distance confidence (shorter = higher confidence)
    const distanceConfidence = Math.max(0, 1 - (distance / 10000)); // 10km max
    
    // Time confidence (shorter span = higher confidence)
    const timeConfidence = Math.max(0, 1 - (timeSpan / 120)); // 2 hours max
    
    return (distanceConfidence + timeConfidence) / 2;
  }

  /**
   * Validate interpolation result
   * @param {Object} result - Interpolation result
   * @returns {boolean} True if valid
   */
  validateResult(result) {
    if (!result || !result.latitude || !result.longitude) return false;
    
    return validateCoordinates(result.latitude, result.longitude);
  }

  /**
   * Get interpolation statistics
   * @returns {Object} Statistics
   */
  getStatistics() {
    return {
      nearbyImagesCount: this.nearbyImages.size,
      timelineAvailable: !!this.timelineParser,
      databaseAvailable: !!this.geolocationDb,
      enhancedFallbackEnabled: this.config.enhancedFallback?.enabled || false
    };
  }

  /**
   * Clear cached data
   */
  clearCache() {
    this.nearbyImages.clear();
  }
}

export default InterpolationService;