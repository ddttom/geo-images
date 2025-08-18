/**
 * Content Analyzer
 * 
 * Analyzes timeline content for data quality, coordinate validation,
 * and statistical analysis of timeline data.
 * 
 * @author Tom Cranstoun <ddttom@github.com>
 */

/**
 * Content analyzer for Timeline diagnostic utility
 */
class ContentAnalyzer {
  constructor(logger) {
    this.logger = logger;
    
    // Coordinate validation bounds
    this.COORDINATE_BOUNDS = {
      latitude: { min: -90, max: 90 },
      longitude: { min: -180, max: 180 }
    };
    
    // Accuracy thresholds (in meters)
    this.ACCURACY_THRESHOLDS = {
      excellent: 5,
      good: 20,
      fair: 100,
      poor: 1000
    };
  }

  /**
   * Analyze timeline content
   */
  async analyzeContent(jsonData, options = {}) {
    const {
      sampleSize = 1000,
      streaming = false,
      deepAnalysis = true
    } = options;

    this.logger.time('Content Analysis');
    this.logger.info(`Starting content analysis with sample size: ${sampleSize}`);

    try {
      const analysis = {
        totalRecords: 0,
        timelineObjects: 0,
        activitySegments: 0,
        placeVisits: 0,
        sampleAnalysis: null,
        dataQuality: null,
        coordinateValidation: null,
        temporalCoverage: null,
        statistics: null,
        issues: [],
        warnings: []
      };

      // Find timeline objects in the data
      const timelineObjects = this.extractTimelineObjects(jsonData);
      analysis.totalRecords = timelineObjects.length;

      if (timelineObjects.length === 0) {
        analysis.issues.push('No timeline objects found for content analysis');
        this.logger.timeEnd('Content Analysis');
        return analysis;
      }

      // Count different types of timeline objects
      const typeCounts = this.countTimelineObjectTypes(timelineObjects);
      analysis.timelineObjects = timelineObjects.length;
      analysis.activitySegments = typeCounts.activitySegments;
      analysis.placeVisits = typeCounts.placeVisits;

      // Create sample for detailed analysis
      const sample = this.createSample(timelineObjects, sampleSize);
      this.logger.info(`Analyzing sample of ${sample.length} records`);

      // Perform detailed analysis on sample
      if (deepAnalysis) {
        analysis.sampleAnalysis = await this.analyzeSample(sample);
        analysis.dataQuality = await this.analyzeDataQuality(sample);
        analysis.coordinateValidation = await this.validateCoordinates(sample);
        analysis.temporalCoverage = await this.analyzeTemporalCoverage(sample);
        analysis.statistics = await this.generateStatistics(sample);
      }

      // Generate issues and warnings
      this.generateContentIssues(analysis);

      this.logger.timeEnd('Content Analysis');
      this.logger.info(`Content analysis completed: ${analysis.totalRecords} total records`);

      return analysis;

    } catch (error) {
      this.logger.error('Content analysis failed:', error.message);
      throw new Error(`Content analysis failed: ${error.message}`);
    }
  }

  /**
   * Extract timeline objects from JSON data
   */
  extractTimelineObjects(data, path = '', maxDepth = 5, currentDepth = 0) {
    const objects = [];

    if (currentDepth > maxDepth || !data || typeof data !== 'object') {
      return objects;
    }

    // Check if current object is a timeline object
    if (data.activitySegment || data.placeVisit) {
      objects.push(data);
      return objects;
    }

    // Check for timelineObjects array
    if (data.timelineObjects && Array.isArray(data.timelineObjects)) {
      objects.push(...data.timelineObjects);
      return objects;
    }

    // Search deeper levels
    if (Array.isArray(data)) {
      data.forEach(item => {
        const found = this.extractTimelineObjects(item, path, maxDepth, currentDepth + 1);
        objects.push(...found);
      });
    } else {
      Object.entries(data).forEach(([key, value]) => {
        const newPath = path ? `${path}.${key}` : key;
        const found = this.extractTimelineObjects(value, newPath, maxDepth, currentDepth + 1);
        objects.push(...found);
      });
    }

    return objects;
  }

  /**
   * Count different types of timeline objects
   */
  countTimelineObjectTypes(timelineObjects) {
    const counts = {
      activitySegments: 0,
      placeVisits: 0,
      unknown: 0
    };

    timelineObjects.forEach(obj => {
      if (obj.activitySegment) {
        counts.activitySegments++;
      } else if (obj.placeVisit) {
        counts.placeVisits++;
      } else {
        counts.unknown++;
      }
    });

    return counts;
  }

  /**
   * Create representative sample from timeline objects
   */
  createSample(timelineObjects, sampleSize) {
    if (timelineObjects.length <= sampleSize) {
      return timelineObjects;
    }

    // Use systematic sampling to ensure representative distribution
    const interval = Math.floor(timelineObjects.length / sampleSize);
    const sample = [];

    for (let i = 0; i < timelineObjects.length; i += interval) {
      if (sample.length >= sampleSize) break;
      sample.push(timelineObjects[i]);
    }

    return sample;
  }

  /**
   * Analyze sample data
   */
  async analyzeSample(sample) {
    const analysis = {
      sampleSize: sample.length,
      activitySegments: 0,
      placeVisits: 0,
      locationsWithCoordinates: 0,
      locationsWithAccuracy: 0,
      timestampsPresent: 0,
      averageAccuracy: null,
      coordinateFormats: {
        e7Format: 0,
        decimalFormat: 0,
        mixed: 0
      }
    };

    let totalAccuracy = 0;
    let accuracyCount = 0;

    sample.forEach(obj => {
      if (obj.activitySegment) {
        analysis.activitySegments++;
        this.analyzeActivitySegment(obj.activitySegment, analysis);
      } else if (obj.placeVisit) {
        analysis.placeVisits++;
        this.analyzePlaceVisit(obj.placeVisit, analysis);
      }
    });

    // Calculate average accuracy
    if (accuracyCount > 0) {
      analysis.averageAccuracy = totalAccuracy / accuracyCount;
    }

    return analysis;
  }

  /**
   * Analyze activity segment
   */
  analyzeActivitySegment(segment, analysis) {
    // Check start location
    if (segment.startLocation) {
      this.analyzeLocation(segment.startLocation, analysis);
    }

    // Check end location
    if (segment.endLocation) {
      this.analyzeLocation(segment.endLocation, analysis);
    }

    // Check duration/timestamps
    if (segment.duration) {
      if (segment.duration.startTimestamp) analysis.timestampsPresent++;
      if (segment.duration.endTimestamp) analysis.timestampsPresent++;
    }

    // Check waypoint path
    if (segment.waypointPath && segment.waypointPath.waypoints) {
      segment.waypointPath.waypoints.forEach(waypoint => {
        this.analyzeLocation(waypoint, analysis);
      });
    }
  }

  /**
   * Analyze place visit
   */
  analyzePlaceVisit(visit, analysis) {
    // Check location
    if (visit.location) {
      this.analyzeLocation(visit.location, analysis);
    }

    // Check duration/timestamps
    if (visit.duration) {
      if (visit.duration.startTimestamp) analysis.timestampsPresent++;
      if (visit.duration.endTimestamp) analysis.timestampsPresent++;
    }
  }

  /**
   * Analyze location data
   */
  analyzeLocation(location, analysis) {
    let hasCoordinates = false;
    let coordinateFormat = null;

    // Check for E7 format coordinates
    if (location.latitudeE7 !== undefined && location.longitudeE7 !== undefined) {
      hasCoordinates = true;
      coordinateFormat = 'e7';
      analysis.coordinateFormats.e7Format++;
    }

    // Check for decimal format coordinates
    if (location.latitude !== undefined && location.longitude !== undefined) {
      if (coordinateFormat === 'e7') {
        coordinateFormat = 'mixed';
        analysis.coordinateFormats.mixed++;
        analysis.coordinateFormats.e7Format--; // Adjust count
      } else {
        hasCoordinates = true;
        coordinateFormat = 'decimal';
        analysis.coordinateFormats.decimalFormat++;
      }
    }

    if (hasCoordinates) {
      analysis.locationsWithCoordinates++;
    }

    // Check for accuracy information
    if (location.accuracy !== undefined) {
      analysis.locationsWithAccuracy++;
    }
  }

  /**
   * Analyze data quality
   */
  async analyzeDataQuality(sample) {
    const quality = {
      validCoordinates: 0,
      invalidCoordinates: 0,
      validTimestamps: 0,
      invalidTimestamps: 0,
      missingData: 0,
      accuracyDistribution: {
        excellent: 0,
        good: 0,
        fair: 0,
        poor: 0,
        unknown: 0
      },
      issues: []
    };

    let totalLocations = 0;
    let totalTimestamps = 0;

    sample.forEach(obj => {
      const locations = this.extractLocationsFromObject(obj);
      const timestamps = this.extractTimestampsFromObject(obj);

      totalLocations += locations.length;
      totalTimestamps += timestamps.length;

      // Validate coordinates
      locations.forEach(location => {
        if (this.isValidCoordinate(location)) {
          quality.validCoordinates++;
        } else {
          quality.invalidCoordinates++;
        }

        // Analyze accuracy
        if (location.accuracy !== undefined) {
          const accuracyLevel = this.categorizeAccuracy(location.accuracy);
          quality.accuracyDistribution[accuracyLevel]++;
        } else {
          quality.accuracyDistribution.unknown++;
        }
      });

      // Validate timestamps
      timestamps.forEach(timestamp => {
        if (this.isValidTimestamp(timestamp)) {
          quality.validTimestamps++;
        } else {
          quality.invalidTimestamps++;
        }
      });
    });

    // Calculate percentages
    if (totalLocations > 0) {
      quality.validCoordinatesPercent = (quality.validCoordinates / totalLocations) * 100;
      quality.invalidCoordinatesPercent = (quality.invalidCoordinates / totalLocations) * 100;
    }

    if (totalTimestamps > 0) {
      quality.validTimestampsPercent = (quality.validTimestamps / totalTimestamps) * 100;
      quality.invalidTimestampsPercent = (quality.invalidTimestamps / totalTimestamps) * 100;
    }

    // Generate quality issues
    this.generateQualityIssues(quality);

    return quality;
  }

  /**
   * Validate coordinates
   */
  async validateCoordinates(sample) {
    const validation = {
      totalCoordinates: 0,
      validCoordinates: 0,
      invalidCoordinates: 0,
      coordinateIssues: [],
      boundaryViolations: {
        latitude: 0,
        longitude: 0
      },
      suspiciousCoordinates: {
        nullIsland: 0, // 0,0 coordinates
        repeated: 0,   // Exact duplicates
        outliers: 0    // Statistical outliers
      }
    };

    const coordinateMap = new Map(); // Track coordinate frequency
    const coordinates = [];

    sample.forEach(obj => {
      const locations = this.extractLocationsFromObject(obj);
      
      locations.forEach(location => {
        validation.totalCoordinates++;
        
        const coord = this.extractCoordinates(location);
        if (coord) {
          coordinates.push(coord);
          
          // Track coordinate frequency
          const coordKey = `${coord.lat},${coord.lng}`;
          coordinateMap.set(coordKey, (coordinateMap.get(coordKey) || 0) + 1);
          
          // Validate coordinate bounds
          if (this.isValidCoordinate(coord)) {
            validation.validCoordinates++;
          } else {
            validation.invalidCoordinates++;
            
            // Track specific violations
            if (coord.lat < this.COORDINATE_BOUNDS.latitude.min || 
                coord.lat > this.COORDINATE_BOUNDS.latitude.max) {
              validation.boundaryViolations.latitude++;
            }
            
            if (coord.lng < this.COORDINATE_BOUNDS.longitude.min || 
                coord.lng > this.COORDINATE_BOUNDS.longitude.max) {
              validation.boundaryViolations.longitude++;
            }
          }
          
          // Check for suspicious coordinates
          if (coord.lat === 0 && coord.lng === 0) {
            validation.suspiciousCoordinates.nullIsland++;
          }
        }
      });
    });

    // Detect repeated coordinates
    coordinateMap.forEach((count, coord) => {
      if (count > 10) { // Threshold for suspicious repetition
        validation.suspiciousCoordinates.repeated++;
      }
    });

    // Detect statistical outliers
    if (coordinates.length > 10) {
      const outliers = this.detectCoordinateOutliers(coordinates);
      validation.suspiciousCoordinates.outliers = outliers.length;
    }

    return validation;
  }

  /**
   * Analyze temporal coverage
   */
  async analyzeTemporalCoverage(sample) {
    const coverage = {
      totalTimestamps: 0,
      validTimestamps: 0,
      dateRange: null,
      timeGaps: [],
      temporalDensity: null,
      patterns: {
        dailyActivity: {},
        hourlyDistribution: new Array(24).fill(0),
        weeklyDistribution: new Array(7).fill(0)
      }
    };

    const timestamps = [];

    sample.forEach(obj => {
      const objTimestamps = this.extractTimestampsFromObject(obj);
      
      objTimestamps.forEach(timestamp => {
        coverage.totalTimestamps++;
        
        if (this.isValidTimestamp(timestamp)) {
          coverage.validTimestamps++;
          const date = new Date(timestamp);
          timestamps.push(date);
          
          // Analyze patterns
          const hour = date.getHours();
          const dayOfWeek = date.getDay();
          const dateKey = date.toISOString().split('T')[0];
          
          coverage.patterns.hourlyDistribution[hour]++;
          coverage.patterns.weeklyDistribution[dayOfWeek]++;
          coverage.patterns.dailyActivity[dateKey] = 
            (coverage.patterns.dailyActivity[dateKey] || 0) + 1;
        }
      });
    });

    if (timestamps.length > 0) {
      // Sort timestamps
      timestamps.sort((a, b) => a - b);
      
      // Calculate date range
      coverage.dateRange = {
        start: timestamps[0].toISOString(),
        end: timestamps[timestamps.length - 1].toISOString(),
        durationDays: (timestamps[timestamps.length - 1] - timestamps[0]) / (1000 * 60 * 60 * 24)
      };
      
      // Calculate temporal density (records per day)
      if (coverage.dateRange.durationDays > 0) {
        coverage.temporalDensity = timestamps.length / coverage.dateRange.durationDays;
      }
      
      // Detect time gaps
      coverage.timeGaps = this.detectTimeGaps(timestamps);
    }

    return coverage;
  }

  /**
   * Generate statistics
   */
  async generateStatistics(sample) {
    const stats = {
      summary: {
        totalObjects: sample.length,
        activitySegments: 0,
        placeVisits: 0,
        locationsAnalyzed: 0,
        timestampsAnalyzed: 0
      },
      coordinates: {
        validCount: 0,
        invalidCount: 0,
        averageAccuracy: null,
        accuracyRange: { min: null, max: null }
      },
      temporal: {
        timeSpan: null,
        averageGap: null,
        recordsPerDay: null
      },
      quality: {
        completenessScore: 0,
        accuracyScore: 0,
        consistencyScore: 0,
        overallScore: 0
      }
    };

    // Calculate basic counts
    sample.forEach(obj => {
      if (obj.activitySegment) stats.summary.activitySegments++;
      if (obj.placeVisit) stats.summary.placeVisits++;
    });

    // Calculate quality scores (0-100)
    const locations = sample.flatMap(obj => this.extractLocationsFromObject(obj));
    const timestamps = sample.flatMap(obj => this.extractTimestampsFromObject(obj));
    
    stats.summary.locationsAnalyzed = locations.length;
    stats.summary.timestampsAnalyzed = timestamps.length;

    // Coordinate statistics
    const validCoords = locations.filter(loc => this.isValidCoordinate(this.extractCoordinates(loc)));
    stats.coordinates.validCount = validCoords.length;
    stats.coordinates.invalidCount = locations.length - validCoords.length;

    // Accuracy statistics
    const accuracies = locations
      .map(loc => loc.accuracy)
      .filter(acc => acc !== undefined && !isNaN(acc));
    
    if (accuracies.length > 0) {
      stats.coordinates.averageAccuracy = accuracies.reduce((sum, acc) => sum + acc, 0) / accuracies.length;
      stats.coordinates.accuracyRange = {
        min: Math.min(...accuracies),
        max: Math.max(...accuracies)
      };
    }

    // Quality scores
    stats.quality.completenessScore = this.calculateCompletenessScore(sample);
    stats.quality.accuracyScore = this.calculateAccuracyScore(locations);
    stats.quality.consistencyScore = this.calculateConsistencyScore(sample);
    stats.quality.overallScore = (
      stats.quality.completenessScore + 
      stats.quality.accuracyScore + 
      stats.quality.consistencyScore
    ) / 3;

    return stats;
  }

  /**
   * Extract locations from timeline object
   */
  extractLocationsFromObject(obj) {
    const locations = [];

    if (obj.activitySegment) {
      if (obj.activitySegment.startLocation) locations.push(obj.activitySegment.startLocation);
      if (obj.activitySegment.endLocation) locations.push(obj.activitySegment.endLocation);
      if (obj.activitySegment.waypointPath && obj.activitySegment.waypointPath.waypoints) {
        locations.push(...obj.activitySegment.waypointPath.waypoints);
      }
    }

    if (obj.placeVisit && obj.placeVisit.location) {
      locations.push(obj.placeVisit.location);
    }

    return locations;
  }

  /**
   * Extract timestamps from timeline object
   */
  extractTimestampsFromObject(obj) {
    const timestamps = [];

    if (obj.activitySegment && obj.activitySegment.duration) {
      if (obj.activitySegment.duration.startTimestamp) {
        timestamps.push(obj.activitySegment.duration.startTimestamp);
      }
      if (obj.activitySegment.duration.endTimestamp) {
        timestamps.push(obj.activitySegment.duration.endTimestamp);
      }
    }

    if (obj.placeVisit && obj.placeVisit.duration) {
      if (obj.placeVisit.duration.startTimestamp) {
        timestamps.push(obj.placeVisit.duration.startTimestamp);
      }
      if (obj.placeVisit.duration.endTimestamp) {
        timestamps.push(obj.placeVisit.duration.endTimestamp);
      }
    }

    return timestamps;
  }

  /**
   * Extract coordinates from location object
   */
  extractCoordinates(location) {
    let lat, lng;

    // Try E7 format first
    if (location.latitudeE7 !== undefined && location.longitudeE7 !== undefined) {
      lat = location.latitudeE7 / 10000000;
      lng = location.longitudeE7 / 10000000;
    }
    // Try decimal format
    else if (location.latitude !== undefined && location.longitude !== undefined) {
      lat = location.latitude;
      lng = location.longitude;
    }
    else {
      return null;
    }

    return { lat, lng, accuracy: location.accuracy };
  }

  /**
   * Validate coordinate values
   */
  isValidCoordinate(coord) {
    if (!coord || typeof coord.lat !== 'number' || typeof coord.lng !== 'number') {
      return false;
    }

    return (
      coord.lat >= this.COORDINATE_BOUNDS.latitude.min &&
      coord.lat <= this.COORDINATE_BOUNDS.latitude.max &&
      coord.lng >= this.COORDINATE_BOUNDS.longitude.min &&
      coord.lng <= this.COORDINATE_BOUNDS.longitude.max &&
      !isNaN(coord.lat) && !isNaN(coord.lng)
    );
  }

  /**
   * Validate timestamp
   */
  isValidTimestamp(timestamp) {
    if (!timestamp) return false;
    
    const date = new Date(timestamp);
    return !isNaN(date.getTime()) && date.getTime() > 0;
  }

  /**
   * Categorize accuracy level
   */
  categorizeAccuracy(accuracy) {
    if (accuracy <= this.ACCURACY_THRESHOLDS.excellent) return 'excellent';
    if (accuracy <= this.ACCURACY_THRESHOLDS.good) return 'good';
    if (accuracy <= this.ACCURACY_THRESHOLDS.fair) return 'fair';
    if (accuracy <= this.ACCURACY_THRESHOLDS.poor) return 'poor';
    return 'poor';
  }

  /**
   * Detect coordinate outliers using statistical methods
   */
  detectCoordinateOutliers(coordinates) {
    if (coordinates.length < 10) return [];

    const lats = coordinates.map(c => c.lat);
    const lngs = coordinates.map(c => c.lng);

    const latOutliers = this.detectStatisticalOutliers(lats);
    const lngOutliers = this.detectStatisticalOutliers(lngs);

    return [...latOutliers, ...lngOutliers];
  }

  /**
   * Detect statistical outliers using IQR method
   */
  detectStatisticalOutliers(values) {
    const sorted = [...values].sort((a, b) => a - b);
    const q1 = sorted[Math.floor(sorted.length * 0.25)];
    const q3 = sorted[Math.floor(sorted.length * 0.75)];
    const iqr = q3 - q1;
    const lowerBound = q1 - 1.5 * iqr;
    const upperBound = q3 + 1.5 * iqr;

    return values.filter(value => value < lowerBound || value > upperBound);
  }

  /**
   * Detect time gaps in timestamps
   */
  detectTimeGaps(timestamps, maxGapHours = 24) {
    const gaps = [];
    const maxGapMs = maxGapHours * 60 * 60 * 1000;

    for (let i = 1; i < timestamps.length; i++) {
      const gap = timestamps[i] - timestamps[i - 1];
      if (gap > maxGapMs) {
        gaps.push({
          start: timestamps[i - 1].toISOString(),
          end: timestamps[i].toISOString(),
          durationHours: gap / (1000 * 60 * 60)
        });
      }
    }

    return gaps;
  }

  /**
   * Calculate completeness score
   */
  calculateCompletenessScore(sample) {
    let totalFields = 0;
    let presentFields = 0;

    sample.forEach(obj => {
      if (obj.activitySegment) {
        totalFields += 4; // startLocation, endLocation, duration, activityType
        if (obj.activitySegment.startLocation) presentFields++;
        if (obj.activitySegment.endLocation) presentFields++;
        if (obj.activitySegment.duration) presentFields++;
        if (obj.activitySegment.activityType) presentFields++;
      }

      if (obj.placeVisit) {
        totalFields += 2; // location, duration
        if (obj.placeVisit.location) presentFields++;
        if (obj.placeVisit.duration) presentFields++;
      }
    });

    return totalFields > 0 ? (presentFields / totalFields) * 100 : 0;
  }

  /**
   * Calculate accuracy score
   */
  calculateAccuracyScore(locations) {
    const validCoords = locations.filter(loc => {
      const coord = this.extractCoordinates(loc);
      return coord && this.isValidCoordinate(coord);
    });

    return locations.length > 0 ? (validCoords.length / locations.length) * 100 : 0;
  }

  /**
   * Calculate consistency score
   */
  calculateConsistencyScore(sample) {
    // Check for consistent coordinate formats
    let e7Count = 0;
    let decimalCount = 0;

    sample.forEach(obj => {
      const locations = this.extractLocationsFromObject(obj);
      locations.forEach(location => {
        if (location.latitudeE7 !== undefined) e7Count++;
        if (location.latitude !== undefined) decimalCount++;
      });
    });

    const total = e7Count + decimalCount;
    if (total === 0) return 0;

    // Higher score for consistent format usage
    const consistency = Math.max(e7Count, decimalCount) / total;
    return consistency * 100;
  }

  /**
   * Generate quality issues
   */
  generateQualityIssues(quality) {
    if (quality.validCoordinatesPercent < 90) {
      quality.issues.push(`Low coordinate validity: ${quality.validCoordinatesPercent.toFixed(1)}%`);
    }

    if (quality.validTimestampsPercent < 95) {
      quality.issues.push(`Low timestamp validity: ${quality.validTimestampsPercent.toFixed(1)}%`);
    }

    if (quality.accuracyDistribution.unknown > quality.accuracyDistribution.excellent) {
      quality.issues.push('Many locations lack accuracy information');
    }
  }

  /**
   * Generate content issues and warnings
   */
  generateContentIssues(analysis) {
    if (analysis.totalRecords === 0) {
      analysis.issues.push('No timeline records found');
    }

    if (analysis.activitySegments === 0 && analysis.placeVisits === 0) {
      analysis.issues.push('No activity segments or place visits found');
    }

    if (analysis.dataQuality && analysis.dataQuality.validCoordinatesPercent < 80) {
      analysis.warnings.push('Low coordinate data quality detected');
    }

    if (analysis.temporalCoverage && analysis.temporalCoverage.timeGaps.length > 10) {
      analysis.warnings.push('Multiple temporal gaps detected in timeline data');
    }
  }
}

export default ContentAnalyzer;