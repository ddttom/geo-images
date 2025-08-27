/**
 * Statistics Utility
 * 
 * Provides comprehensive statistics tracking, error management, and report
 * generation for geo scanning operations with detailed analytics.
 * 
 * @author Tom Cranstoun <ddttom@github.com>
 */

import chalk from 'chalk';

/**
 * Statistics tracker class for geo scanning operations
 */
export class StatisticsTracker {
  constructor() {
    this.reset();
  }

  /**
   * Reset all statistics to initial state
   */
  reset() {
    this.statistics = {
      totalFiles: 0,
      imageFiles: 0,
      geoTaggedImages: 0,
      newEntries: 0,
      duplicatesFound: 0,
      errors: 0,
      errorsByType: {},
      processingTime: 0,
      startTime: null,
      endTime: null
    };
  }

  /**
   * Start timing the operation
   */
  startTiming() {
    this.statistics.startTime = Date.now();
  }

  /**
   * End timing the operation
   */
  endTiming() {
    this.statistics.endTime = Date.now();
    if (this.statistics.startTime) {
      this.statistics.processingTime = this.statistics.endTime - this.statistics.startTime;
    }
  }

  /**
   * Record an error with categorization
   * @param {string} category - Error category
   * @param {string} filePath - File path where error occurred
   * @param {string} message - Error message
   * @param {Object} metadata - Additional error metadata
   */
  recordError(category, filePath, message, metadata = {}) {
    this.statistics.errors++;
    
    if (!this.statistics.errorsByType[category]) {
      this.statistics.errorsByType[category] = 0;
    }
    this.statistics.errorsByType[category]++;

    // Store detailed error information if needed
    if (!this.statistics.detailedErrors) {
      this.statistics.detailedErrors = [];
    }

    this.statistics.detailedErrors.push({
      category,
      filePath,
      message,
      timestamp: new Date().toISOString(),
      ...metadata
    });
  }

  /**
   * Increment a statistic counter
   * @param {string} key - Statistic key
   * @param {number} increment - Amount to increment (default: 1)
   */
  increment(key, increment = 1) {
    if (this.statistics.hasOwnProperty(key)) {
      this.statistics[key] += increment;
    }
  }

  /**
   * Set a statistic value
   * @param {string} key - Statistic key
   * @param {any} value - Value to set
   */
  set(key, value) {
    this.statistics[key] = value;
  }

  /**
   * Get current statistics
   * @returns {Object} Current statistics object
   */
  getStatistics() {
    return { ...this.statistics };
  }

  /**
   * Get processing duration in milliseconds
   * @returns {number} Processing duration
   */
  getProcessingDuration() {
    if (this.statistics.startTime && this.statistics.endTime) {
      return this.statistics.endTime - this.statistics.startTime;
    }
    if (this.statistics.startTime) {
      return Date.now() - this.statistics.startTime;
    }
    return this.statistics.processingTime || 0;
  }

  /**
   * Calculate success rate
   * @returns {number} Success rate as percentage
   */
  getSuccessRate() {
    if (this.statistics.imageFiles === 0) {
      return 0;
    }
    return (this.statistics.geoTaggedImages / this.statistics.imageFiles) * 100;
  }

  /**
   * Get error rate
   * @returns {number} Error rate as percentage
   */
  getErrorRate() {
    if (this.statistics.imageFiles === 0) {
      return 0;
    }
    return (this.statistics.errors / this.statistics.imageFiles) * 100;
  }
}

/**
 * Generate comprehensive statistics report
 * @param {StatisticsTracker} tracker - Statistics tracker instance
 * @param {Array} existingLocations - Existing location data
 * @returns {Object} Comprehensive report object
 */
export function generateReport(tracker, existingLocations = []) {
  const stats = tracker.getStatistics();
  const successRate = tracker.getSuccessRate();
  const errorRate = tracker.getErrorRate();
  const processingTime = tracker.getProcessingDuration();

  return {
    timestamp: new Date().toISOString(),
    scanning: {
      totalFiles: stats.totalFiles,
      imageFiles: stats.imageFiles,
      geoTaggedImages: stats.geoTaggedImages,
      successRate: stats.imageFiles > 0 ? `${successRate.toFixed(1)}%` : '0%'
    },
    processing: {
      newEntries: stats.newEntries,
      duplicatesFound: stats.duplicatesFound,
      errors: stats.errors,
      errorRate: stats.imageFiles > 0 ? `${errorRate.toFixed(1)}%` : '0%',
      processingTime: processingTime
    },
    errors: stats.errorsByType,
    dataset: {
      totalEntries: existingLocations.length + stats.newEntries,
      existingEntries: existingLocations.length,
      addedEntries: stats.newEntries
    },
    performance: {
      averageTimePerImage: stats.imageFiles > 0 ? Math.round(processingTime / stats.imageFiles) : 0,
      imagesPerSecond: processingTime > 0 ? ((stats.imageFiles / processingTime) * 1000).toFixed(2) : 0
    }
  };
}

/**
 * Display processing summary with colored output
 * @param {Object} report - Report object from generateReport
 * @param {Object} options - Display options
 */
export function displaySummary(report, options = {}) {
  const {
    showErrors = true,
    showPerformance = true,
    showDataset = true
  } = options;

  console.log(chalk.blue.bold('\n📈 Processing Summary\n'));
  
  // Scanning statistics
  console.log(`${chalk.green('📁 Total Files Scanned:')} ${report.scanning.totalFiles}`);
  console.log(`${chalk.cyan('🖼️ Image Files Found:')} ${report.scanning.imageFiles}`);
  console.log(`${chalk.green('📍 Geo-tagged Images:')} ${report.scanning.geoTaggedImages}`);
  console.log(`${chalk.blue('📊 GPS Success Rate:')} ${report.scanning.successRate}`);
  console.log(`${chalk.yellow('📋 New Entries Added:')} ${report.processing.newEntries}`);
  console.log(`${chalk.magenta('🔄 Duplicates Found:')} ${report.processing.duplicatesFound}`);
  
  // Error information
  if (showErrors && report.processing.errors > 0) {
    console.log(`${chalk.red('❌ Errors:')} ${report.processing.errors} (${report.processing.errorRate})`);
    
    if (Object.keys(report.errors).length > 0) {
      console.log(chalk.yellow.bold('\n📋 Error Categories:'));
      Object.entries(report.errors).forEach(([category, count]) => {
        console.log(`  ${chalk.yellow('•')} ${category}: ${count}`);
      });
    }
  }
  
  // Performance metrics
  if (showPerformance) {
    console.log(`${chalk.blue('⏱️ Processing Time:')} ${report.processing.processingTime}ms`);
    if (report.performance.averageTimePerImage > 0) {
      console.log(`${chalk.cyan('⚡ Average Time per Image:')} ${report.performance.averageTimePerImage}ms`);
      console.log(`${chalk.green('🚀 Images per Second:')} ${report.performance.imagesPerSecond}`);
    }
  }
  
  // Dataset information
  if (showDataset) {
    console.log(`${chalk.cyan('💾 Total Dataset Size:')} ${report.dataset.totalEntries} entries`);
    if (report.dataset.existingEntries > 0) {
      console.log(`${chalk.gray('📂 Existing Entries:')} ${report.dataset.existingEntries}`);
    }
  }
}

/**
 * Create error summary from statistics
 * @param {Object} errorsByType - Errors categorized by type
 * @returns {Object} Error summary with recommendations
 */
export function createErrorSummary(errorsByType) {
  const totalErrors = Object.values(errorsByType).reduce((sum, count) => sum + count, 0);
  
  if (totalErrors === 0) {
    return {
      totalErrors: 0,
      categories: {},
      recommendations: ['No errors encountered during processing.']
    };
  }

  const recommendations = [];
  const categories = { ...errorsByType };

  // Generate recommendations based on error types
  if (categories.invalid_coordinates) {
    recommendations.push('Some images have invalid GPS coordinates. Check EXIF data quality.');
  }

  if (categories.processing_error) {
    recommendations.push('Processing errors occurred. Check file permissions and disk space.');
  }

  if (categories.exif_read_error) {
    recommendations.push('EXIF reading errors detected. Verify image file integrity.');
  }

  if (categories.file_access_error) {
    recommendations.push('File access errors found. Check file permissions and paths.');
  }

  if (totalErrors > 10) {
    recommendations.push('High error count detected. Consider reviewing input data quality.');
  }

  return {
    totalErrors,
    categories,
    recommendations
  };
}

/**
 * Calculate processing efficiency metrics
 * @param {Object} statistics - Statistics object
 * @returns {Object} Efficiency metrics
 */
export function calculateEfficiencyMetrics(statistics) {
  const {
    totalFiles,
    imageFiles,
    geoTaggedImages,
    errors,
    processingTime
  } = statistics;

  const fileDiscoveryRate = totalFiles > 0 ? (imageFiles / totalFiles) * 100 : 0;
  const geoTaggingRate = imageFiles > 0 ? (geoTaggedImages / imageFiles) * 100 : 0;
  const errorRate = imageFiles > 0 ? (errors / imageFiles) * 100 : 0;
  const throughput = processingTime > 0 ? (imageFiles / processingTime) * 1000 : 0; // images per second

  return {
    fileDiscoveryRate: parseFloat(fileDiscoveryRate.toFixed(2)),
    geoTaggingRate: parseFloat(geoTaggingRate.toFixed(2)),
    errorRate: parseFloat(errorRate.toFixed(2)),
    throughput: parseFloat(throughput.toFixed(2)),
    averageProcessingTime: imageFiles > 0 ? Math.round(processingTime / imageFiles) : 0
  };
}

/**
 * Generate performance recommendations based on statistics
 * @param {Object} statistics - Statistics object
 * @param {Object} config - Configuration object
 * @returns {Array} Array of recommendation strings
 */
export function generatePerformanceRecommendations(statistics, config = {}) {
  const recommendations = [];
  const efficiency = calculateEfficiencyMetrics(statistics);

  // Success rate recommendations
  if (efficiency.geoTaggingRate < 50) {
    recommendations.push('Low GPS success rate. Consider checking timeline data quality and image timestamps.');
  } else if (efficiency.geoTaggingRate > 90) {
    recommendations.push('Excellent GPS success rate achieved!');
  }

  // Error rate recommendations
  if (efficiency.errorRate > 10) {
    recommendations.push('High error rate detected. Review error categories and consider data quality improvements.');
  } else if (efficiency.errorRate < 1) {
    recommendations.push('Very low error rate - excellent data quality.');
  }

  // Performance recommendations
  if (efficiency.throughput < 1) {
    recommendations.push('Low processing throughput. Consider increasing batch size or optimizing timeline data.');
  } else if (efficiency.throughput > 10) {
    recommendations.push('Excellent processing performance achieved!');
  }

  // Batch size recommendations
  if (config.batchSize && efficiency.averageProcessingTime > 1000) {
    recommendations.push(`Consider reducing batch size from ${config.batchSize} to improve memory usage.`);
  } else if (config.batchSize && efficiency.averageProcessingTime < 100) {
    recommendations.push(`Consider increasing batch size from ${config.batchSize} to improve throughput.`);
  }

  // File discovery recommendations
  if (efficiency.fileDiscoveryRate < 10) {
    recommendations.push('Low image file discovery rate. Verify the scan directory contains image files.');
  }

  return recommendations;
}

/**
 * Export statistics to JSON format
 * @param {Object} report - Report object
 * @param {string} filePath - Output file path
 * @returns {Promise<void>}
 */
export async function exportStatistics(report, filePath) {
  const { writeFile } = await import('fs/promises');
  
  try {
    const jsonData = JSON.stringify(report, null, 2);
    await writeFile(filePath, jsonData, 'utf8');
  } catch (error) {
    throw new Error(`Failed to export statistics: ${error.message}`);
  }
}

/**
 * Create a progress tracker for batch operations
 * @param {number} totalItems - Total number of items to process
 * @param {number} reportInterval - Interval for progress reports
 * @returns {Object} Progress tracker object
 */
export function createProgressTracker(totalItems, reportInterval = 10) {
  let processedItems = 0;
  let lastReportTime = Date.now();
  
  return {
    update: (increment = 1) => {
      processedItems += increment;
      const progress = (processedItems / totalItems) * 100;
      const currentTime = Date.now();
      
      // Report progress at intervals
      if (processedItems % reportInterval === 0 || processedItems === totalItems) {
        const timeElapsed = currentTime - lastReportTime;
        const itemsPerSecond = reportInterval / (timeElapsed / 1000);
        
        return {
          processed: processedItems,
          total: totalItems,
          percentage: progress.toFixed(1),
          itemsPerSecond: itemsPerSecond.toFixed(1),
          isComplete: processedItems >= totalItems
        };
      }
      
      return null;
    },
    
    getProgress: () => ({
      processed: processedItems,
      total: totalItems,
      percentage: ((processedItems / totalItems) * 100).toFixed(1),
      isComplete: processedItems >= totalItems
    })
  };
}

/**
 * Format duration in human-readable format
 * @param {number} milliseconds - Duration in milliseconds
 * @returns {string} Formatted duration string
 */
export function formatDuration(milliseconds) {
  if (milliseconds < 1000) {
    return `${milliseconds}ms`;
  }
  
  const seconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

/**
 * Format file size in human-readable format
 * @param {number} bytes - Size in bytes
 * @returns {string} Formatted size string
 */
export function formatFileSize(bytes) {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let unitIndex = 0;
  
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  
  return `${size.toFixed(1)} ${units[unitIndex]}`;
}