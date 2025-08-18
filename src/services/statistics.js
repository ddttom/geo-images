/**
 * Statistics Service
 * 
 * Handles comprehensive reporting and analytics for the geo-tagging process.
 * Tracks successes, failures, performance metrics, and generates detailed reports.
 * 
 * @author Tom Cranstoun <ddttom@github.com>
 */

import { writeFile } from 'fs/promises';
import { join } from 'path';

/**
 * Service for statistics tracking and reporting
 */
class StatisticsService {
  constructor() {
    this.startTime = new Date();
    this.totalImages = 0;
    this.processedImages = 0;
    this.successCount = 0;
    this.failureCount = 0;
    
    // Detailed tracking
    this.successes = new Map(); // category -> array of file paths
    this.failures = new Map();  // category -> array of {filePath, reason}
    this.processingTimes = [];
    this.memoryUsage = [];
    
    // Performance metrics
    this.batchStats = [];
    this.interpolationStats = {
      timeline: 0,
      nearbyImages: 0,
      enhancedFallback: 0,
      spatialInterpolation: 0
    };
    
    // Error categories
    this.errorCategories = {
      'metadata_extraction': 'Failed to extract image metadata',
      'invalid_coordinates': 'GPS coordinates are invalid',
      'timeline_missing': 'No timeline data available',
      'interpolation_failed': 'All interpolation methods failed',
      'exif_write_failed': 'Failed to write GPS data to image',
      'file_access_error': 'Cannot access image file',
      'processing_timeout': 'Processing timed out',
      'unknown_error': 'Unknown processing error'
    };
  }

  /**
   * Set total number of images to process
   * @param {number} total - Total image count
   */
  setTotalImages(total) {
    this.totalImages = total;
  }

  /**
   * Record a successful operation
   * @param {string} category - Success category
   * @param {string} filePath - File path
   * @param {Object} metadata - Additional metadata
   */
  recordSuccess(category, filePath, metadata = {}) {
    this.successCount++;
    this.processedImages++;
    
    if (!this.successes.has(category)) {
      this.successes.set(category, []);
    }
    
    this.successes.get(category).push({
      filePath,
      timestamp: new Date(),
      ...metadata
    });
    
    // Track interpolation method statistics
    if (category === 'interpolation' && metadata.method) {
      this.interpolationStats[metadata.method] = (this.interpolationStats[metadata.method] || 0) + 1;
    }
  }

  /**
   * Record a failed operation
   * @param {string} category - Failure category
   * @param {string} filePath - File path
   * @param {string} reason - Failure reason
   * @param {Object} metadata - Additional metadata
   */
  recordFailure(category, filePath, reason, metadata = {}) {
    this.failureCount++;
    this.processedImages++;
    
    if (!this.failures.has(category)) {
      this.failures.set(category, []);
    }
    
    this.failures.get(category).push({
      filePath,
      reason,
      timestamp: new Date(),
      ...metadata
    });
  }

  /**
   * Record processing time for an operation
   * @param {string} operation - Operation name
   * @param {number} timeMs - Time in milliseconds
   * @param {Object} metadata - Additional metadata
   */
  recordProcessingTime(operation, timeMs, metadata = {}) {
    this.processingTimes.push({
      operation,
      timeMs,
      timestamp: new Date(),
      ...metadata
    });
  }

  /**
   * Record memory usage snapshot
   * @param {string} phase - Processing phase
   */
  recordMemoryUsage(phase) {
    const usage = process.memoryUsage();
    this.memoryUsage.push({
      phase,
      timestamp: new Date(),
      heapUsed: usage.heapUsed,
      heapTotal: usage.heapTotal,
      external: usage.external,
      rss: usage.rss
    });
  }

  /**
   * Record batch processing statistics
   * @param {number} batchNumber - Batch number
   * @param {number} batchSize - Number of images in batch
   * @param {number} processingTimeMs - Processing time in milliseconds
   * @param {number} successCount - Number of successful operations
   * @param {number} failureCount - Number of failed operations
   */
  recordBatchStats(batchNumber, batchSize, processingTimeMs, successCount, failureCount) {
    this.batchStats.push({
      batchNumber,
      batchSize,
      processingTimeMs,
      successCount,
      failureCount,
      successRate: batchSize > 0 ? (successCount / batchSize) * 100 : 0,
      averageTimePerImage: batchSize > 0 ? processingTimeMs / batchSize : 0,
      timestamp: new Date()
    });
  }

  /**
   * Generate comprehensive report
   * @returns {Object} Complete statistics report
   */
  generateReport() {
    const endTime = new Date();
    const totalTimeMs = endTime.getTime() - this.startTime.getTime();
    
    return {
      // Basic metrics
      totalImages: this.totalImages,
      processedImages: this.processedImages,
      successCount: this.successCount,
      failureCount: this.failureCount,
      successRate: this.processedImages > 0 ? (this.successCount / this.processedImages) * 100 : 0,
      
      // Timing
      startTime: this.startTime.toISOString(),
      endTime: endTime.toISOString(),
      totalTimeMs,
      totalTimeFormatted: this.formatDuration(totalTimeMs),
      averageTimePerImage: this.processedImages > 0 ? totalTimeMs / this.processedImages : 0,
      
      // Success breakdown
      successesByCategory: this.getSuccessesByCategory(),
      
      // Failure analysis
      failuresByCategory: this.getFailuresByCategory(),
      failureReasons: this.getFailureReasons(),
      
      // Interpolation statistics
      interpolationStats: this.interpolationStats,
      interpolationSuccessRate: this.calculateInterpolationSuccessRate(),
      
      // Performance metrics
      batchStatistics: this.getBatchStatistics(),
      memoryStatistics: this.getMemoryStatistics(),
      processingTimeStatistics: this.getProcessingTimeStatistics(),
      
      // Recommendations
      recommendations: this.generateRecommendations()
    };
  }

  /**
   * Get successes grouped by category
   * @returns {Object} Successes by category
   */
  getSuccessesByCategory() {
    const result = {};
    for (const [category, items] of this.successes) {
      result[category] = items.length;
    }
    return result;
  }

  /**
   * Get failures grouped by category
   * @returns {Object} Failures by category
   */
  getFailuresByCategory() {
    const result = {};
    for (const [category, items] of this.failures) {
      result[category] = items.length;
    }
    return result;
  }

  /**
   * Get detailed failure reasons
   * @returns {Array} Array of failure details
   */
  getFailureReasons() {
    const reasons = [];
    
    for (const [category, items] of this.failures) {
      items.forEach(item => {
        reasons.push({
          category,
          filePath: item.filePath,
          reason: item.reason,
          timestamp: item.timestamp,
          description: this.errorCategories[category] || 'Unknown error category'
        });
      });
    }
    
    return reasons.sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Calculate interpolation success rate
   * @returns {Object} Interpolation statistics
   */
  calculateInterpolationSuccessRate() {
    const totalInterpolations = Object.values(this.interpolationStats).reduce((sum, count) => sum + count, 0);
    const interpolationFailures = this.failures.get('interpolation_failed')?.length || 0;
    const totalAttempts = totalInterpolations + interpolationFailures;
    
    return {
      totalAttempts,
      successfulInterpolations: totalInterpolations,
      failedInterpolations: interpolationFailures,
      successRate: totalAttempts > 0 ? (totalInterpolations / totalAttempts) * 100 : 0,
      methodBreakdown: this.interpolationStats
    };
  }

  /**
   * Get batch processing statistics
   * @returns {Object} Batch statistics summary
   */
  getBatchStatistics() {
    if (this.batchStats.length === 0) return null;
    
    const totalBatches = this.batchStats.length;
    const avgBatchSize = this.batchStats.reduce((sum, batch) => sum + batch.batchSize, 0) / totalBatches;
    const avgProcessingTime = this.batchStats.reduce((sum, batch) => sum + batch.processingTimeMs, 0) / totalBatches;
    const avgSuccessRate = this.batchStats.reduce((sum, batch) => sum + batch.successRate, 0) / totalBatches;
    
    return {
      totalBatches,
      averageBatchSize: Math.round(avgBatchSize),
      averageProcessingTimeMs: Math.round(avgProcessingTime),
      averageSuccessRate: Math.round(avgSuccessRate * 100) / 100,
      batches: this.batchStats
    };
  }

  /**
   * Get memory usage statistics
   * @returns {Object} Memory statistics summary
   */
  getMemoryStatistics() {
    if (this.memoryUsage.length === 0) return null;
    
    const heapUsages = this.memoryUsage.map(m => m.heapUsed);
    const maxHeapUsed = Math.max(...heapUsages);
    const avgHeapUsed = heapUsages.reduce((sum, usage) => sum + usage, 0) / heapUsages.length;
    
    return {
      peakMemoryUsage: this.formatBytes(maxHeapUsed),
      averageMemoryUsage: this.formatBytes(avgHeapUsed),
      memorySnapshots: this.memoryUsage.length,
      snapshots: this.memoryUsage.map(snapshot => ({
        phase: snapshot.phase,
        heapUsed: this.formatBytes(snapshot.heapUsed),
        timestamp: snapshot.timestamp
      }))
    };
  }

  /**
   * Get processing time statistics
   * @returns {Object} Processing time statistics
   */
  getProcessingTimeStatistics() {
    if (this.processingTimes.length === 0) return null;
    
    const times = this.processingTimes.map(p => p.timeMs);
    const totalTime = times.reduce((sum, time) => sum + time, 0);
    const avgTime = totalTime / times.length;
    const maxTime = Math.max(...times);
    const minTime = Math.min(...times);
    
    // Group by operation
    const byOperation = {};
    this.processingTimes.forEach(p => {
      if (!byOperation[p.operation]) {
        byOperation[p.operation] = [];
      }
      byOperation[p.operation].push(p.timeMs);
    });
    
    const operationStats = {};
    for (const [operation, operationTimes] of Object.entries(byOperation)) {
      const opTotal = operationTimes.reduce((sum, time) => sum + time, 0);
      operationStats[operation] = {
        count: operationTimes.length,
        totalTimeMs: opTotal,
        averageTimeMs: Math.round(opTotal / operationTimes.length),
        maxTimeMs: Math.max(...operationTimes),
        minTimeMs: Math.min(...operationTimes)
      };
    }
    
    return {
      totalOperations: this.processingTimes.length,
      totalTimeMs,
      averageTimeMs: Math.round(avgTime),
      maxTimeMs: maxTime,
      minTimeMs: minTime,
      operationBreakdown: operationStats
    };
  }

  /**
   * Generate recommendations based on statistics
   * @returns {Array} Array of recommendations
   */
  generateRecommendations() {
    const recommendations = [];
    const successRate = this.processedImages > 0 ? (this.successCount / this.processedImages) * 100 : 0;
    
    // Success rate recommendations
    if (successRate < 50) {
      recommendations.push({
        type: 'low_success_rate',
        priority: 'high',
        message: `Low success rate (${successRate.toFixed(1)}%). Consider checking timeline data quality and image timestamps.`
      });
    } else if (successRate > 90) {
      recommendations.push({
        type: 'excellent_performance',
        priority: 'info',
        message: `Excellent success rate (${successRate.toFixed(1)}%). Current configuration is working well.`
      });
    }
    
    // Timeline data recommendations
    const timelineFailures = this.failures.get('timeline_missing')?.length || 0;
    if (timelineFailures > this.totalImages * 0.3) {
      recommendations.push({
        type: 'timeline_data',
        priority: 'high',
        message: 'Many images lack timeline data. Ensure Timeline Edits.json is properly formatted and covers the image date range.'
      });
    }
    
    // Performance recommendations
    const avgTimePerImage = this.processedImages > 0 ? (new Date().getTime() - this.startTime.getTime()) / this.processedImages : 0;
    if (avgTimePerImage > 5000) { // 5 seconds per image
      recommendations.push({
        type: 'performance',
        priority: 'medium',
        message: 'Processing is slower than expected. Consider reducing batch size or optimizing timeline data.'
      });
    }
    
    // Memory usage recommendations
    if (this.memoryUsage.length > 0) {
      const maxHeap = Math.max(...this.memoryUsage.map(m => m.heapUsed));
      if (maxHeap > 1024 * 1024 * 1024) { // 1GB
        recommendations.push({
          type: 'memory_usage',
          priority: 'medium',
          message: 'High memory usage detected. Consider processing images in smaller batches.'
        });
      }
    }
    
    return recommendations;
  }

  /**
   * Save report to file
   * @param {string} filePath - Output file path
   * @returns {Promise<void>}
   */
  async saveReport(filePath) {
    try {
      const report = this.generateReport();
      const jsonData = JSON.stringify(report, null, 2);
      
      await writeFile(filePath, jsonData, 'utf8');
      
    } catch (error) {
      throw new Error(`Failed to save report: ${error.message}`);
    }
  }

  /**
   * Format duration in milliseconds to human readable format
   * @param {number} ms - Duration in milliseconds
   * @returns {string} Formatted duration
   */
  formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
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
   * Format bytes to human readable format
   * @param {number} bytes - Number of bytes
   * @returns {string} Formatted bytes
   */
  formatBytes(bytes) {
    const sizes = ['B', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 B';
    
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    const size = bytes / Math.pow(1024, i);
    
    return `${Math.round(size * 100) / 100} ${sizes[i]}`;
  }

  /**
   * Reset all statistics
   */
  reset() {
    this.startTime = new Date();
    this.totalImages = 0;
    this.processedImages = 0;
    this.successCount = 0;
    this.failureCount = 0;
    this.successes.clear();
    this.failures.clear();
    this.processingTimes = [];
    this.memoryUsage = [];
    this.batchStats = [];
    this.interpolationStats = {
      timeline: 0,
      nearbyImages: 0,
      enhancedFallback: 0,
      spatialInterpolation: 0
    };
  }

  /**
   * Get current progress percentage
   * @returns {number} Progress percentage (0-100)
   */
  getProgress() {
    return this.totalImages > 0 ? (this.processedImages / this.totalImages) * 100 : 0;
  }

  /**
   * Get real-time statistics summary
   * @returns {Object} Current statistics
   */
  getCurrentStats() {
    const progress = this.getProgress();
    const successRate = this.processedImages > 0 ? (this.successCount / this.processedImages) * 100 : 0;
    const elapsedTime = new Date().getTime() - this.startTime.getTime();
    
    return {
      progress: Math.round(progress * 100) / 100,
      processedImages: this.processedImages,
      totalImages: this.totalImages,
      successCount: this.successCount,
      failureCount: this.failureCount,
      successRate: Math.round(successRate * 100) / 100,
      elapsedTime: this.formatDuration(elapsedTime),
      estimatedTimeRemaining: progress > 0 ? this.formatDuration((elapsedTime / progress) * (100 - progress)) : 'Unknown'
    };
  }
}

export default StatisticsService;