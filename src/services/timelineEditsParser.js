/**
 * Timeline Edits Parser Service
 * 
 * Handles parsing and processing of Google Timeline Edits.json files
 * to extract location data for GPS coordinate interpolation.
 * 
 * @author Tom Cranstoun <ddttom@github.com>
 */

import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';

/**
 * Service for parsing Google Timeline Edits data
 */
class TimelineEditsParserService {
  constructor(logger) {
    this.logger = logger;
    this.locationData = new Map();
    
    // File paths
    this.timelineEditsPath = join(process.cwd(), 'data', 'Timeline Edits.json');
  }

  /**
   * Load and process timeline edits data
   * @returns {Promise<void>}
   */
  async loadTimelineEdits() {
    this.logger.info('Loading Timeline Edits data...');
    
    try {
      if (!existsSync(this.timelineEditsPath)) {
        this.logger.warn('Timeline Edits.json not found');
        return;
      }

      const timelineJson = await readFile(this.timelineEditsPath, 'utf8');
      const timelineData = JSON.parse(timelineJson);
      
      this.logger.info('Processing Timeline Edits.json...');
      
      let processedCount = 0;
      let skippedCount = 0;
      
      // Process timeline edits
      if (timelineData.timelineEdits) {
        for (const edit of timelineData.timelineEdits) {
          const processed = this.processTimelineEdit(edit);
          if (processed > 0) {
            processedCount += processed;
          } else {
            skippedCount++;
          }
        }
      }
      
      this.logger.info(`Processed ${processedCount} location points from ${timelineData.timelineEdits?.length || 0} timeline edits, skipped ${skippedCount}`);
      
    } catch (error) {
      this.logger.error('Failed to process Timeline Edits.json:', error.message);
      throw error;
    }
  }

  /**
   * Process a single timeline edit entry
   * @param {Object} edit - Timeline edit data
   * @returns {number} Number of location points processed
   */
  processTimelineEdit(edit) {
    let processedCount = 0;

    try {
      // Process place aggregates
      if (edit.placeAggregates) {
        processedCount += this.processPlaceAggregates(edit.placeAggregates);
      }

      // Process raw signals
      if (edit.rawSignal) {
        processedCount += this.processRawSignal(edit.rawSignal);
      }

      // Process other potential location data
      if (edit.locationData) {
        processedCount += this.processLocationData(edit.locationData);
      }

    } catch (error) {
      this.logger.debug('Failed to process timeline edit:', error.message);
    }

    return processedCount;
  }

  /**
   * Process place aggregates from timeline edit
   * @param {Object} placeAggregates - Place aggregates data
   * @returns {number} Number of location points processed
   */
  processPlaceAggregates(placeAggregates) {
    let processedCount = 0;

    try {
      // Process place aggregate info
      if (placeAggregates.placeAggregateInfo && Array.isArray(placeAggregates.placeAggregateInfo)) {
        for (const placeInfo of placeAggregates.placeAggregateInfo) {
          // Use the place point (more accurate than the general point)
          const location = placeInfo.placePoint || placeInfo.point;
          
          if (location && location.latE7 !== undefined && location.lngE7 !== undefined) {
            // Use the process window time as timestamp
            const timestamp = placeAggregates.processWindow?.startTime || 
                             placeAggregates.processWindow?.endTime;
            
            if (timestamp) {
              this.addLocationPoint(
                timestamp,
                {
                  latitudeE7: location.latE7,
                  longitudeE7: location.lngE7,
                  accuracy: this.calculateAccuracyFromScore(placeInfo.score)
                },
                'timeline_edits_place',
                {
                  placeId: placeInfo.placeId,
                  score: placeInfo.score
                }
              );
              processedCount++;
            }
          }
        }
      }

      // Process process window as a general location if we have coordinates
      if (placeAggregates.processWindow && placeAggregates.placeAggregateInfo?.length > 0) {
        // Use the highest scored place as representative location for the time window
        const topPlace = placeAggregates.placeAggregateInfo
          .reduce((max, place) => (place.score > max.score) ? place : max);
        
        if (topPlace && placeAggregates.processWindow.endTime) {
          const location = topPlace.placePoint || topPlace.point;
          if (location) {
            this.addLocationPoint(
              placeAggregates.processWindow.endTime,
              {
                latitudeE7: location.latE7,
                longitudeE7: location.lngE7,
                accuracy: this.calculateAccuracyFromScore(topPlace.score)
              },
              'timeline_edits_window_end',
              {
                windowSizeHrs: placeAggregates.windowSizeHrs,
                topScore: topPlace.score
              }
            );
            processedCount++;
          }
        }
      }

    } catch (error) {
      this.logger.debug('Failed to process place aggregates:', error.message);
    }

    return processedCount;
  }

  /**
   * Process raw signal data from timeline edit
   * @param {Object} rawSignal - Raw signal data
   * @returns {number} Number of location points processed
   */
  processRawSignal(rawSignal) {
    let processedCount = 0;

    try {
      if (rawSignal.signal) {
        // Process position records (most common location data)
        if (rawSignal.signal.position) {
          processedCount += this.processPositionRecord(rawSignal.signal.position);
        }

        // Process activity records
        if (rawSignal.signal.activityRecord) {
          processedCount += this.processActivityRecord(rawSignal.signal.activityRecord);
        }

        // Process location records
        if (rawSignal.signal.locationRecord) {
          processedCount += this.processLocationRecord(rawSignal.signal.locationRecord);
        }

        // Process other signal types
        if (rawSignal.signal.wifiScan) {
          processedCount += this.processWifiScan(rawSignal.signal.wifiScan);
        }
      }

    } catch (error) {
      this.logger.debug('Failed to process raw signal:', error.message);
    }

    return processedCount;
  }

  /**
   * Process position record from raw signal
   * @param {Object} positionRecord - Position record data
   * @returns {number} Number of location points processed
   */
  processPositionRecord(positionRecord) {
    let processedCount = 0;

    try {
      if (positionRecord.timestamp && positionRecord.point && 
          positionRecord.point.latE7 !== undefined && positionRecord.point.lngE7 !== undefined) {
        
        // Convert accuracy from millimeters to meters
        let accuracy = positionRecord.accuracyMm ? positionRecord.accuracyMm / 1000 : undefined;
        
        const location = {
          latitudeE7: positionRecord.point.latE7,
          longitudeE7: positionRecord.point.lngE7,
          accuracy: accuracy
        };

        // Add additional metadata from position record
        const metadata = {
          source: positionRecord.source,
          altitudeMeters: positionRecord.altitudeMeters,
          speedMetersPerSecond: positionRecord.speedMetersPerSecond
        };

        this.addLocationPoint(
          positionRecord.timestamp,
          location,
          'timeline_edits_position',
          metadata
        );
        processedCount++;
      }

    } catch (error) {
      this.logger.debug('Failed to process position record:', error.message);
    }

    return processedCount;
  }

  /**
   * Process activity record from raw signal
   * @param {Object} activityRecord - Activity record data
   * @returns {number} Number of location points processed
   */
  processActivityRecord(activityRecord) {
    let processedCount = 0;

    try {
      if (activityRecord.timestamp) {
        // Activity records may not have direct location but have timestamp
        // We can use this for temporal interpolation
        this.logger.debug(`Found activity record at ${activityRecord.timestamp}`);
        
        // If there are detected activities, log them for context
        if (activityRecord.detectedActivities) {
          this.logger.debug(`Activities: ${JSON.stringify(activityRecord.detectedActivities)}`);
        }
      }

    } catch (error) {
      this.logger.debug('Failed to process activity record:', error.message);
    }

    return processedCount;
  }

  /**
   * Process location record from raw signal
   * @param {Object} locationRecord - Location record data
   * @returns {number} Number of location points processed
   */
  processLocationRecord(locationRecord) {
    let processedCount = 0;

    try {
      if (locationRecord.timestamp && 
          (locationRecord.latE7 !== undefined || locationRecord.latitude !== undefined)) {
        
        const location = {
          latitudeE7: locationRecord.latE7,
          longitudeE7: locationRecord.lngE7,
          latitude: locationRecord.latitude,
          longitude: locationRecord.longitude,
          accuracy: locationRecord.accuracy
        };

        this.addLocationPoint(
          locationRecord.timestamp,
          location,
          'timeline_edits_location_record'
        );
        processedCount++;
      }

    } catch (error) {
      this.logger.debug('Failed to process location record:', error.message);
    }

    return processedCount;
  }

  /**
   * Process WiFi scan data (may contain location inference)
   * @param {Object} wifiScan - WiFi scan data
   * @returns {number} Number of location points processed
   */
  processWifiScan(wifiScan) {
    let processedCount = 0;

    try {
      // WiFi scans might have inferred locations
      if (wifiScan.timestamp && wifiScan.inferredLocation) {
        const location = wifiScan.inferredLocation;
        
        this.addLocationPoint(
          wifiScan.timestamp,
          {
            latitudeE7: location.latE7,
            longitudeE7: location.lngE7,
            accuracy: location.accuracy || 1000 // WiFi accuracy is typically lower
          },
          'timeline_edits_wifi_inferred'
        );
        processedCount++;
      }

    } catch (error) {
      this.logger.debug('Failed to process WiFi scan:', error.message);
    }

    return processedCount;
  }

  /**
   * Process additional location data
   * @param {Object} locationData - Location data
   * @returns {number} Number of location points processed
   */
  processLocationData(locationData) {
    let processedCount = 0;

    try {
      // Process any direct location data in the edit
      if (Array.isArray(locationData)) {
        for (const location of locationData) {
          if (location.timestamp && 
              (location.latE7 !== undefined || location.latitude !== undefined)) {
            
            this.addLocationPoint(
              location.timestamp,
              location,
              'timeline_edits_direct_location'
            );
            processedCount++;
          }
        }
      }

    } catch (error) {
      this.logger.debug('Failed to process location data:', error.message);
    }

    return processedCount;
  }

  /**
   * Add a location point to the database
   * @param {string} timestamp - ISO timestamp
   * @param {Object} location - Location data
   * @param {string} source - Source identifier
   * @param {Object} metadata - Additional metadata
   */
  addLocationPoint(timestamp, location, source, metadata = {}) {
    if (!timestamp || !location) return;
    
    try {
      // Validate timestamp
      if (!this.isValidTimestamp(timestamp)) {
        this.logger.debug(`Invalid timestamp from ${source}: ${timestamp}`);
        return;
      }
      
      // Extract coordinates
      let latitude, longitude, accuracy;
      
      if (location.latE7 !== undefined && location.lngE7 !== undefined) {
        // E7 format (multiply by 10^-7)
        latitude = location.latE7 / 10000000;
        longitude = location.lngE7 / 10000000;
      } else if (location.latitudeE7 !== undefined && location.longitudeE7 !== undefined) {
        // E7 format with full names
        latitude = location.latitudeE7 / 10000000;
        longitude = location.longitudeE7 / 10000000;
      } else if (location.latitude !== undefined && location.longitude !== undefined) {
        // Direct decimal format
        latitude = location.latitude;
        longitude = location.longitude;
      } else {
        return; // No valid coordinates
      }
      
      // Skip invalid coordinates
      if (latitude === 0 && longitude === 0) return;
      if (!this.isValidCoordinate(latitude, longitude)) return;
      
      // Extract accuracy
      if (location.accuracy !== undefined) {
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
          accuracy,
          metadata
        });
      }
      
    } catch (error) {
      this.logger.debug(`Failed to add location point: ${error.message}`);
    }
  }

  /**
   * Calculate accuracy estimate from place score
   * @param {number} score - Place score
   * @returns {number} Estimated accuracy in meters
   */
  calculateAccuracyFromScore(score) {
    if (!score || score <= 0) return 1000; // Default poor accuracy
    
    // Higher scores indicate more confidence, so lower accuracy values (better precision)
    // This is a heuristic mapping - adjust based on observed data
    if (score >= 100) return 50;   // High confidence = ~50m accuracy
    if (score >= 50) return 100;   // Medium confidence = ~100m accuracy
    if (score >= 10) return 500;   // Low confidence = ~500m accuracy
    return 1000;                   // Very low confidence = ~1000m accuracy
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
   * Get all location data as array (compatible with TimelineParserService)
   * @returns {Array} Array of location records
   */
  getLocationDataArray() {
    const locationArray = [];
    
    for (const [timestamp, location] of this.locationData) {
      try {
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
          accuracy: location.accuracy,
          metadata: location.metadata
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
   * Find GPS coordinates for a given timestamp (compatible with TimelineParserService)
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
          timeDifference: distance / 1000 / 60, // minutes
          metadata: location.metadata
        };
        bestDistance = distance;
      }
    }
    
    return bestMatch;
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
    this.locationData.clear();
  }
}

export default TimelineEditsParserService;