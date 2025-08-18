/**
 * Timeline Parser Service
 * 
 * Handles parsing and processing of Google Maps timeline data from Timeline Edits.json
 * and manages the location.json database for GPS coordinate lookups.
 * 
 * @author Tom Cranstoun <ddttom@github.com>
 */

import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import TimelineEditsParserService from './timelineEditsParser.js';

/**
 * Service for parsing Google Maps timeline data
 */
class TimelineParserService {
  constructor(logger) {
    this.logger = logger;
    this.timelineData = [];
    this.locationData = new Map();
    
    // File paths
    this.timelineEditsPath = join(process.cwd(), 'data', 'Timeline Edits.json');
    this.locationJsonPath = join(process.cwd(), 'data', 'location.json');
  }

  /**
   * Load and process timeline data
   * @returns {Promise<void>}
   */
  async loadTimelineData() {
    this.logger.info('Loading timeline data...');
    
    try {
      // Load existing location.json if it exists
      await this.loadExistingLocationData();
      
      // Load and process timeline file if it exists
      if (existsSync(this.timelineEditsPath)) {
        await this.loadTimelineFile();
      } else {
        this.logger.warn('Timeline file not found, using existing location data only');
      }
      
      this.logger.info(`Loaded ${this.locationData.size} location records`);
      
    } catch (error) {
      this.logger.error('Failed to load timeline data:', error.message);
      throw error;
    }
  }

  /**
   * Load and process timeline file (supports both standard and edits formats)
   * @returns {Promise<void>}
   */
  async loadTimelineFile() {
    try {
      const timelineJson = await readFile(this.timelineEditsPath, 'utf8');
      const timelineData = JSON.parse(timelineJson);
      
      // Detect format and process accordingly
      if (timelineData.timelineObjects) {
        this.logger.info('Processing standard Timeline format...');
        await this.processStandardTimeline(timelineData);
      } else if (timelineData.timelineEdits) {
        this.logger.info('Processing Timeline Edits format...');
        await this.processTimelineEdits(timelineData);
      } else {
        this.logger.warn('Unknown timeline format detected');
        // Try to process as Timeline Edits anyway
        await this.processTimelineEdits(timelineData);
      }
      
    } catch (error) {
      this.logger.error('Failed to process timeline file:', error.message);
      throw error;
    }
  }

  /**
   * Process standard timeline format
   * @param {Object} timelineData - Timeline data
   * @returns {Promise<void>}
   */
  async processStandardTimeline(timelineData) {
    let processedCount = 0;
    let skippedCount = 0;
    
    // Process timeline entries
    if (timelineData.timelineObjects) {
      for (const timelineObject of timelineData.timelineObjects) {
        if (timelineObject.activitySegment) {
          this.processActivitySegment(timelineObject.activitySegment);
          processedCount++;
        } else if (timelineObject.placeVisit) {
          this.processPlaceVisit(timelineObject.placeVisit);
          processedCount++;
        } else {
          skippedCount++;
        }
      }
    }
    
    this.logger.info(`Processed ${processedCount} timeline objects, skipped ${skippedCount}`);
  }

  /**
   * Process Timeline Edits format using dedicated parser
   * @param {Object} timelineData - Timeline edits data
   * @returns {Promise<void>}
   */
  async processTimelineEdits(timelineData) {
    const editsParser = new TimelineEditsParserService(this.logger);
    
    // Process the timeline edits data
    let processedCount = 0;
    
    if (timelineData.timelineEdits) {
      for (const edit of timelineData.timelineEdits) {
        const processed = editsParser.processTimelineEdit(edit);
        processedCount += processed;
      }
    }
    
    // Merge the location data from the edits parser
    const editsLocationData = editsParser.getLocationDataArray();
    editsLocationData.forEach(record => {
      const timestampMs = new Date(record.timestamp).getTime();
      this.locationData.set(timestampMs, {
        latitude: record.latitude,
        longitude: record.longitude,
        source: record.source,
        accuracy: record.accuracy
      });
    });
    
    this.logger.info(`Processed ${processedCount} location points from Timeline Edits format`);
  }

  /**
   * Load existing location.json data
   * @returns {Promise<void>}
   */
  async loadExistingLocationData() {
    try {
      if (existsSync(this.locationJsonPath)) {
        const locationJson = await readFile(this.locationJsonPath, 'utf8');
        const locationArray = JSON.parse(locationJson);
        
        // Convert array to Map for efficient lookups
        locationArray.forEach(record => {
          if (record.timestamp && record.latitude && record.longitude) {
            const timestamp = new Date(record.timestamp).getTime();
            this.locationData.set(timestamp, {
              latitude: record.latitude,
              longitude: record.longitude,
              source: record.source || 'location.json',
              accuracy: record.accuracy || null
            });
          }
        });
        
        this.logger.info(`Loaded ${locationArray.length} existing location records`);
      }
    } catch (error) {
      this.logger.warn('Failed to load existing location.json:', error.message);
    }
  }

  /**
   * Process activity segment from timeline
   * @param {Object} activitySegment - Activity segment data
   */
  processActivitySegment(activitySegment) {
    try {
      // Process start location
      if (activitySegment.startLocation) {
        this.addLocationPoint(
          activitySegment.duration?.startTimestamp,
          activitySegment.startLocation,
          'timeline_activity_start'
        );
      }
      
      // Process end location
      if (activitySegment.endLocation) {
        this.addLocationPoint(
          activitySegment.duration?.endTimestamp,
          activitySegment.endLocation,
          'timeline_activity_end'
        );
      }
      
      // Process waypoint path if available
      if (activitySegment.waypointPath?.waypoints) {
        activitySegment.waypointPath.waypoints.forEach((waypoint, index) => {
          // Estimate timestamp for waypoints
          const startTime = new Date(activitySegment.duration?.startTimestamp).getTime();
          const endTime = new Date(activitySegment.duration?.endTimestamp).getTime();
          const duration = endTime - startTime;
          const waypointTime = startTime + (duration * index / activitySegment.waypointPath.waypoints.length);
          
          this.addLocationPoint(
            new Date(waypointTime).toISOString(),
            waypoint,
            'timeline_waypoint'
          );
        });
      }
      
    } catch (error) {
      this.logger.debug('Failed to process activity segment:', error.message);
    }
  }

  /**
   * Process place visit from timeline
   * @param {Object} placeVisit - Place visit data
   */
  processPlaceVisit(placeVisit) {
    try {
      if (placeVisit.location) {
        // Use arrival time, or start time as fallback
        const timestamp = placeVisit.duration?.startTimestamp || 
                         placeVisit.duration?.endTimestamp;
        
        if (timestamp) {
          this.addLocationPoint(
            timestamp,
            placeVisit.location,
            'timeline_place_visit'
          );
        }
      }
    } catch (error) {
      this.logger.debug('Failed to process place visit:', error.message);
    }
  }

  /**
   * Add a location point to the database
   * @param {string} timestamp - ISO timestamp
   * @param {Object} location - Location data from timeline
   * @param {string} source - Source identifier
   */
  addLocationPoint(timestamp, location, source) {
    if (!timestamp || !location) return;
    
    try {
      // Validate timestamp first
      if (!this.isValidTimestamp(timestamp)) {
        this.logger.debug(`Invalid timestamp from ${source}: ${timestamp}`);
        return;
      }
      
      // Extract coordinates
      let latitude, longitude, accuracy;
      
      if (location.latitudeE7 && location.longitudeE7) {
        // E7 format (multiply by 10^-7)
        latitude = location.latitudeE7 / 10000000;
        longitude = location.longitudeE7 / 10000000;
      } else if (location.latitude && location.longitude) {
        // Direct decimal format
        latitude = location.latitude;
        longitude = location.longitude;
      } else {
        return; // No valid coordinates
      }
      
      // Skip invalid coordinates (null placeholders)
      if (latitude === 0 && longitude === 0) return;
      if (!this.isValidCoordinate(latitude, longitude)) return;
      
      // Extract accuracy if available
      if (location.accuracy) {
        accuracy = location.accuracy;
      }
      
      const timestampMs = new Date(timestamp).getTime();
      
      // Only add if we don't already have a record for this exact timestamp
      // or if the new record has better accuracy
      const existing = this.locationData.get(timestampMs);
      if (!existing || (accuracy && (!existing.accuracy || accuracy < existing.accuracy))) {
        this.locationData.set(timestampMs, {
          latitude,
          longitude,
          source,
          accuracy
        });
      }
      
    } catch (error) {
      this.logger.debug(`Failed to add location point: ${error.message}`);
    }
  }

  /**
   * Find GPS coordinates for a given timestamp
   * @param {Date} targetTimestamp - Target timestamp
   * @param {number} toleranceMinutes - Tolerance in minutes
   * @returns {Object|null} GPS coordinates or null
   */
  findCoordinatesForTimestamp(targetTimestamp, toleranceMinutes = 60) {
    if (!targetTimestamp) return null;
    
    const targetMs = targetTimestamp.getTime();
    const toleranceMs = toleranceMinutes * 60 * 1000;
    
    let bestMatch = null;
    let bestDistance = Infinity;
    
    // Search for the closest timestamp within tolerance
    for (const [timestamp, location] of this.locationData) {
      const distance = Math.abs(timestamp - targetMs);
      
      if (distance <= toleranceMs && distance < bestDistance) {
        bestMatch = {
          latitude: location.latitude,
          longitude: location.longitude,
          source: location.source,
          accuracy: location.accuracy,
          timeDifference: distance / 1000 / 60 // minutes
        };
        bestDistance = distance;
      }
    }
    
    return bestMatch;
  }

  /**
   * Find coordinates with enhanced fallback search
   * @param {Date} targetTimestamp - Target timestamp
   * @param {Object} fallbackConfig - Fallback configuration
   * @returns {Object|null} GPS coordinates or null
   */
  findCoordinatesWithFallback(targetTimestamp, fallbackConfig = {}) {
    const {
      maxToleranceHours = 24,
      progressiveSearch = true
    } = fallbackConfig;
    
    if (!progressiveSearch) {
      return this.findCoordinatesForTimestamp(targetTimestamp, maxToleranceHours * 60);
    }
    
    // Progressive search: 1h → 6h → same day
    const searchTolerances = [60, 360, maxToleranceHours * 60];
    
    for (const tolerance of searchTolerances) {
      const result = this.findCoordinatesForTimestamp(targetTimestamp, tolerance);
      if (result) {
        return result;
      }
    }
    
    return null;
  }

  /**
   * Get all location data as array
   * @returns {Array} Array of location records
   */
  getLocationDataArray() {
    const locationArray = [];
    
    for (const [timestamp, location] of this.locationData) {
      try {
        // Validate timestamp before creating Date object
        const date = new Date(timestamp);
        if (isNaN(date.getTime())) {
          this.logger.debug(`Skipping invalid timestamp in locationData: ${timestamp}`);
          continue;
        }
        
        locationArray.push({
          timestamp: date.toISOString(),
          latitude: location.latitude,
          longitude: location.longitude,
          source: location.source,
          accuracy: location.accuracy
        });
      } catch (error) {
        this.logger.debug(`Error processing timestamp ${timestamp}: ${error.message}`);
        continue;
      }
    }
    
    // Sort by timestamp
    return locationArray.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  }

  /**
   * Save location data to location.json
   * @returns {Promise<void>}
   */
  async saveLocationData() {
    try {
      const locationArray = this.getLocationDataArray();
      const jsonData = JSON.stringify(locationArray, null, 2);
      
      await writeFile(this.locationJsonPath, jsonData, 'utf8');
      
      this.logger.info(`Saved ${locationArray.length} location records to location.json`);
      
    } catch (error) {
      this.logger.error('Failed to save location data:', error.message);
      throw error;
    }
  }

  /**
   * Add GPS data from image to location database
   * @param {string} filePath - Image file path
   * @param {Object} gpsData - GPS data from image
   * @param {Date} timestamp - Image timestamp
   */
  addImageGPSData(filePath, gpsData, timestamp) {
    if (!timestamp || !gpsData.latitude || !gpsData.longitude) return;
    
    // Validate timestamp before processing
    if (!this.isValidTimestamp(timestamp)) {
      this.logger.debug(`Invalid timestamp for image ${filePath}: ${timestamp}`);
      return;
    }
    
    // Validate coordinates
    if (!this.isValidCoordinate(gpsData.latitude, gpsData.longitude)) {
      this.logger.debug(`Invalid coordinates for image ${filePath}: ${gpsData.latitude}, ${gpsData.longitude}`);
      return;
    }
    
    const timestampMs = timestamp.getTime();
    
    // Add with high priority (image GPS is usually accurate)
    this.locationData.set(timestampMs, {
      latitude: gpsData.latitude,
      longitude: gpsData.longitude,
      source: `image:${filePath}`,
      accuracy: 1 // High accuracy for image GPS
    });
  }

  /**
   * Validate timestamp value
   * @param {*} timestamp - Timestamp value to validate
   * @returns {boolean} True if valid
   */
  isValidTimestamp(timestamp) {
    if (!timestamp) return false;
    
    const date = new Date(timestamp);
    return !isNaN(date.getTime()) && date.getTime() > 0;
  }

  /**
   * Validate coordinate values
   * @param {number} latitude - Latitude value
   * @param {number} longitude - Longitude value
   * @returns {boolean} True if valid
   */
  isValidCoordinate(latitude, longitude) {
    return (
      typeof latitude === 'number' &&
      typeof longitude === 'number' &&
      latitude >= -90 && latitude <= 90 &&
      longitude >= -180 && longitude <= 180 &&
      !isNaN(latitude) && !isNaN(longitude)
    );
  }

  /**
   * Get statistics about loaded timeline data
   * @returns {Object} Statistics
   */
  getStatistics() {
    const locationArray = this.getLocationDataArray();
    const sources = {};
    
    locationArray.forEach(record => {
      sources[record.source] = (sources[record.source] || 0) + 1;
    });
    
    return {
      totalRecords: locationArray.length,
      dateRange: locationArray.length > 0 ? {
        start: locationArray[0].timestamp,
        end: locationArray[locationArray.length - 1].timestamp
      } : null,
      sources
    };
  }

  /**
   * Clear all timeline data
   */
  clearData() {
    this.timelineData = [];
    this.locationData.clear();
  }
}

export default TimelineParserService;