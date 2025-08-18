/**
 * Timeline Augmentation Service
 * 
 * Enhances timeline data by extracting GPS coordinates from existing photos
 * and adding them to the location database for better interpolation coverage.
 * 
 * @author Tom Cranstoun <ddttom@github.com>
 */

import { writeFile, readFile, copyFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { calculateDistance } from '../utils/distance.js';

/**
 * Service for timeline augmentation with image GPS data
 */
class TimelineAugmentationService {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
    this.augmentedCount = 0;
    this.duplicateCount = 0;
    this.errorCount = 0;
  }

  /**
   * Augment timeline with GPS data from images
   * @param {Array} imageMetadata - Array of image metadata objects
   * @param {Object} timelineParser - Existing timeline parser instance
   * @returns {Promise<Object>} Augmentation results
   */
  async augmentTimeline(imageMetadata, timelineParser = null) {
    this.logger.info('Starting timeline augmentation...');
    
    try {
      // Create backup if enabled
      if (this.config.createBackup) {
        await this.createTimelineBackup();
      }
      
      // Reset counters
      this.resetCounters();
      
      // Filter images with GPS data
      const geotaggedImages = imageMetadata.filter(img => img.hasGPS && img.timestamp);
      
      if (geotaggedImages.length === 0) {
        this.logger.info('No geotagged images found for augmentation');
        return this.getResults();
      }
      
      this.logger.info(`Found ${geotaggedImages.length} geotagged images for augmentation`);
      
      // Use provided timeline parser or get a new one
      const parser = timelineParser || await this.getTimelineParser();
      
      // Process each geotagged image
      for (const imageData of geotaggedImages) {
        await this.processGeotaggedImage(imageData, parser);
      }
      
      // Save augmented timeline data
      await parser.saveLocationData();
      
      const results = this.getResults();
      this.logger.info(`Timeline augmentation completed: ${results.augmentedCount} added, ${results.duplicateCount} duplicates, ${results.errorCount} errors`);
      
      return results;
      
    } catch (error) {
      this.logger.error('Timeline augmentation failed:', error.message);
      throw error;
    }
  }

  /**
   * Process a single geotagged image
   * @param {Object} imageData - Image metadata
   * @param {Object} timelineParser - Timeline parser instance
   */
  async processGeotaggedImage(imageData, timelineParser) {
    try {
      const { filePath, latitude, longitude, timestamp } = imageData;
      
      if (!this.isValidGPSData(latitude, longitude)) {
        this.errorCount++;
        this.logger.debug(`Invalid GPS data for ${filePath}`);
        return;
      }
      
      // Check for existing nearby records to avoid duplicates
      if (await this.isDuplicateRecord(timelineParser, timestamp, latitude, longitude)) {
        this.duplicateCount++;
        this.logger.debug(`Duplicate GPS record for ${filePath}`);
        return;
      }
      
      // Add GPS data to timeline
      timelineParser.addImageGPSData(filePath, { latitude, longitude }, timestamp);
      this.augmentedCount++;
      
      this.logger.debug(`Added GPS data from ${filePath} to timeline`);
      
    } catch (error) {
      this.errorCount++;
      this.logger.warn(`Failed to process ${imageData.filePath}:`, error.message);
    }
  }

  /**
   * Check if GPS record is a duplicate
   * @param {Object} timelineParser - Timeline parser instance
   * @param {Date} timestamp - Image timestamp
   * @param {number} latitude - GPS latitude
   * @param {number} longitude - GPS longitude
   * @returns {Promise<boolean>} True if duplicate
   */
  async isDuplicateRecord(timelineParser, timestamp, latitude, longitude) {
    const toleranceMinutes = this.config.exactTimeTolerance || 2;
    
    // Find existing records within time tolerance
    const existingRecord = timelineParser.findCoordinatesForTimestamp(timestamp, toleranceMinutes);
    
    if (!existingRecord) return false;
    
    // Calculate distance between coordinates
    const distance = calculateDistance(
      latitude, longitude,
      existingRecord.latitude, existingRecord.longitude
    );
    
    // Consider duplicate if within 50 meters (typical GPS accuracy)
    return distance < 50;
  }

  /**
   * Validate GPS data
   * @param {number} latitude - Latitude value
   * @param {number} longitude - Longitude value
   * @returns {boolean} True if valid
   */
  isValidGPSData(latitude, longitude) {
    return (
      typeof latitude === 'number' &&
      typeof longitude === 'number' &&
      latitude >= -90 && latitude <= 90 &&
      longitude >= -180 && longitude <= 180 &&
      !isNaN(latitude) && !isNaN(longitude) &&
      !(latitude === 0 && longitude === 0) // Exclude null island
    );
  }

  /**
   * Create backup of timeline data
   * @returns {Promise<void>}
   */
  async createTimelineBackup() {
    try {
      const locationJsonPath = join(process.cwd(), 'data', 'location.json');
      
      if (existsSync(locationJsonPath)) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupPath = join(process.cwd(), 'data', `location-backup-${timestamp}.json`);
        
        await copyFile(locationJsonPath, backupPath);
        this.logger.info(`Created timeline backup: ${backupPath}`);
      }
      
    } catch (error) {
      this.logger.warn('Failed to create timeline backup:', error.message);
    }
  }

  /**
   * Get timeline parser instance
   * @returns {Promise<Object>} Timeline parser instance
   */
  async getTimelineParser() {
    // This would typically be injected, but for now we'll create a minimal interface
    const TimelineParserService = (await import('./timelineParser.js')).default;
    const { createLogger } = await import('../utils/debugLogger.js');
    
    const logger = createLogger('TimelineAugmentation');
    const timelineParser = new TimelineParserService(logger);
    
    await timelineParser.loadTimelineData();
    return timelineParser;
  }

  /**
   * Analyze image distribution for augmentation potential
   * @param {Array} imageMetadata - Array of image metadata
   * @returns {Object} Analysis results
   */
  analyzeAugmentationPotential(imageMetadata) {
    const geotaggedImages = imageMetadata.filter(img => img.hasGPS && img.timestamp);
    const untaggedImages = imageMetadata.filter(img => !img.hasGPS && img.timestamp);
    
    // Group by date for temporal analysis
    const geotaggedByDate = this.groupImagesByDate(geotaggedImages);
    const untaggedByDate = this.groupImagesByDate(untaggedImages);
    
    // Calculate coverage statistics
    const totalDates = new Set([
      ...Object.keys(geotaggedByDate),
      ...Object.keys(untaggedByDate)
    ]).size;
    
    const coveredDates = Object.keys(geotaggedByDate).length;
    const coveragePercentage = totalDates > 0 ? (coveredDates / totalDates) * 100 : 0;
    
    return {
      totalImages: imageMetadata.length,
      geotaggedImages: geotaggedImages.length,
      untaggedImages: untaggedImages.length,
      geotaggedPercentage: imageMetadata.length > 0 ? (geotaggedImages.length / imageMetadata.length) * 100 : 0,
      totalDates,
      coveredDates,
      coveragePercentage,
      geotaggedByDate,
      untaggedByDate
    };
  }

  /**
   * Group images by date
   * @param {Array} images - Array of image metadata
   * @returns {Object} Images grouped by date
   */
  groupImagesByDate(images) {
    const grouped = {};
    
    images.forEach(img => {
      if (img.timestamp) {
        const dateKey = img.timestamp.toISOString().split('T')[0];
        if (!grouped[dateKey]) {
          grouped[dateKey] = [];
        }
        grouped[dateKey].push(img);
      }
    });
    
    return grouped;
  }

  /**
   * Find temporal gaps in GPS coverage
   * @param {Array} imageMetadata - Array of image metadata
   * @returns {Array} Array of gap periods
   */
  findTemporalGaps(imageMetadata) {
    const geotaggedImages = imageMetadata
      .filter(img => img.hasGPS && img.timestamp)
      .sort((a, b) => a.timestamp - b.timestamp);
    
    if (geotaggedImages.length < 2) return [];
    
    const gaps = [];
    const maxGapHours = 24; // Consider gaps longer than 24 hours
    
    for (let i = 1; i < geotaggedImages.length; i++) {
      const prevTime = geotaggedImages[i - 1].timestamp.getTime();
      const currTime = geotaggedImages[i].timestamp.getTime();
      const gapHours = (currTime - prevTime) / (1000 * 60 * 60);
      
      if (gapHours > maxGapHours) {
        gaps.push({
          start: geotaggedImages[i - 1].timestamp,
          end: geotaggedImages[i].timestamp,
          durationHours: gapHours,
          startLocation: {
            latitude: geotaggedImages[i - 1].latitude,
            longitude: geotaggedImages[i - 1].longitude
          },
          endLocation: {
            latitude: geotaggedImages[i].latitude,
            longitude: geotaggedImages[i].longitude
          }
        });
      }
    }
    
    return gaps;
  }

  /**
   * Generate augmentation recommendations
   * @param {Array} imageMetadata - Array of image metadata
   * @returns {Object} Recommendations
   */
  generateRecommendations(imageMetadata) {
    const analysis = this.analyzeAugmentationPotential(imageMetadata);
    const gaps = this.findTemporalGaps(imageMetadata);
    
    const recommendations = [];
    
    // Low coverage recommendation
    if (analysis.coveragePercentage < 30) {
      recommendations.push({
        type: 'low_coverage',
        priority: 'high',
        message: `Only ${analysis.coveragePercentage.toFixed(1)}% of dates have GPS coverage. Consider enabling GPS on camera or using external GPS logger.`
      });
    }
    
    // Large temporal gaps
    if (gaps.length > 0) {
      const largestGap = gaps.reduce((max, gap) => gap.durationHours > max.durationHours ? gap : max);
      recommendations.push({
        type: 'temporal_gaps',
        priority: 'medium',
        message: `Found ${gaps.length} temporal gaps in GPS data. Largest gap: ${largestGap.durationHours.toFixed(1)} hours.`
      });
    }
    
    // Good augmentation potential
    if (analysis.geotaggedPercentage > 20 && analysis.geotaggedPercentage < 80) {
      recommendations.push({
        type: 'good_potential',
        priority: 'low',
        message: `${analysis.geotaggedImages} geotagged images can help interpolate coordinates for ${analysis.untaggedImages} untagged images.`
      });
    }
    
    return {
      analysis,
      gaps,
      recommendations
    };
  }

  /**
   * Reset counters
   */
  resetCounters() {
    this.augmentedCount = 0;
    this.duplicateCount = 0;
    this.errorCount = 0;
  }

  /**
   * Get augmentation results
   * @returns {Object} Results summary
   */
  getResults() {
    return {
      augmentedCount: this.augmentedCount,
      duplicateCount: this.duplicateCount,
      errorCount: this.errorCount,
      totalProcessed: this.augmentedCount + this.duplicateCount + this.errorCount
    };
  }

  /**
   * Get augmentation statistics
   * @returns {Object} Statistics
   */
  getStatistics() {
    return {
      ...this.getResults(),
      config: {
        exactTimeTolerance: this.config.exactTimeTolerance,
        createBackup: this.config.createBackup
      }
    };
  }
}

export default TimelineAugmentationService;