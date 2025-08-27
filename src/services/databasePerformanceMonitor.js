/**
 * Database Performance Monitor Service
 * 
 * Monitors SQLite query performance, tracks index usage, and provides
 * comprehensive analytics for database optimization.
 * 
 * @author Tom Cranstoun <ddttom@github.com>
 */

/**
 * Database performance monitoring service
 */
class DatabasePerformanceMonitor {
  constructor(db, logger) {
    this.db = db;
    this.logger = logger;
    this.queryStats = new Map();
    this.indexUsageStats = new Map();
    this.slowQueryThreshold = 100; // milliseconds
  }

  /**
   * Monitor a query execution
   * @param {string} queryType - Type of query (e.g., 'coordinate_lookup', 'timeline_search')
   * @param {string} sql - SQL query
   * @param {Array} params - Query parameters
   * @param {Function} queryFunction - Function that executes the query
   * @returns {Promise<any>} Query result
   */
  async monitorQuery(queryType, sql, params, queryFunction) {
    const startTime = process.hrtime.bigint();
    let result;
    let error = null;
    
    try {
      // Execute the query
      result = await queryFunction();
      
      // Get query execution plan
      const executionPlan = await this.getQueryExecutionPlan(sql, params);
      
      const endTime = process.hrtime.bigint();
      const executionTimeMs = Number(endTime - startTime) / 1000000; // Convert to milliseconds
      
      // Record query statistics
      await this.recordQueryStats(queryType, sql, params, executionTimeMs, executionPlan, result);
      
      // Log slow queries
      if (executionTimeMs > this.slowQueryThreshold) {
        this.logger.warn(`Slow query detected: ${queryType}`, {
          executionTime: `${executionTimeMs.toFixed(2)}ms`,
          sql: sql.replace(/\s+/g, ' ').trim(),
          params,
          executionPlan
        });
      }
      
      return result;
      
    } catch (err) {
      error = err;
      const endTime = process.hrtime.bigint();
      const executionTimeMs = Number(endTime - startTime) / 1000000;
      
      // Record failed query
      await this.recordQueryStats(queryType, sql, params, executionTimeMs, null, null, error);
      
      throw err;
    }
  }

  /**
   * Get query execution plan
   * @param {string} sql - SQL query
   * @param {Array} params - Query parameters
   * @returns {Promise<Array>} Execution plan
   */
  async getQueryExecutionPlan(sql, params) {
    return new Promise((resolve) => {
      try {
        // Replace parameters with placeholders for EXPLAIN QUERY PLAN
        let explainSql = `EXPLAIN QUERY PLAN ${sql}`;
        
        this.db.all(explainSql, params, (err, rows) => {
          if (err) {
            this.logger.debug('Failed to get execution plan:', err.message);
            resolve([]);
          } else {
            resolve(rows || []);
          }
        });
      } catch (error) {
        this.logger.debug('Failed to get execution plan:', error.message);
        resolve([]);
      }
    });
  }

  /**
   * Record query statistics
   * @param {string} queryType - Type of query
   * @param {string} sql - SQL query
   * @param {Array} params - Query parameters
   * @param {number} executionTimeMs - Execution time in milliseconds
   * @param {Array} executionPlan - Query execution plan
   * @param {any} result - Query result
   * @param {Error} error - Error if query failed
   * @returns {Promise<void>}
   */
  async recordQueryStats(queryType, sql, params, executionTimeMs, executionPlan, result, error = null) {
    try {
      // Extract index usage from execution plan
      const indexUsed = this.extractIndexUsage(executionPlan);
      
      // Count rows examined and returned
      const rowsExamined = this.extractRowsExamined(executionPlan);
      const rowsReturned = Array.isArray(result) ? result.length : (result ? 1 : 0);
      
      // Store in database
      await this.storeQueryStats({
        queryType,
        executionTimeMs,
        rowsExamined,
        rowsReturned,
        indexUsed,
        success: !error,
        errorMessage: error?.message || null
      });
      
      // Update in-memory statistics
      this.updateInMemoryStats(queryType, executionTimeMs, indexUsed, !error);
      
    } catch (err) {
      this.logger.debug('Failed to record query stats:', err.message);
    }
  }

  /**
   * Extract index usage from execution plan
   * @param {Array} executionPlan - Query execution plan
   * @returns {string} Index name or 'table_scan'
   */
  extractIndexUsage(executionPlan) {
    if (!executionPlan || executionPlan.length === 0) {
      return 'unknown';
    }
    
    for (const step of executionPlan) {
      const detail = step.detail || '';
      if (detail.includes('USING INDEX')) {
        const match = detail.match(/USING INDEX (\w+)/);
        return match ? match[1] : 'index_used';
      } else if (detail.includes('SCAN TABLE')) {
        return 'table_scan';
      }
    }
    
    return 'unknown';
  }

  /**
   * Extract rows examined from execution plan
   * @param {Array} executionPlan - Query execution plan
   * @returns {number} Estimated rows examined
   */
  extractRowsExamined(executionPlan) {
    if (!executionPlan || executionPlan.length === 0) {
      return 0;
    }
    
    // This is a simplified estimation - SQLite doesn't always provide exact row counts
    for (const step of executionPlan) {
      const detail = step.detail || '';
      if (detail.includes('SCAN TABLE')) {
        return 1000; // Estimate for table scan
      } else if (detail.includes('SEARCH TABLE')) {
        return 10; // Estimate for index search
      }
    }
    
    return 1;
  }

  /**
   * Store query statistics in database
   * @param {Object} stats - Query statistics
   * @returns {Promise<void>}
   */
  async storeQueryStats(stats) {
    return new Promise((resolve, reject) => {
      this.db.run(`
        INSERT INTO geolocation_query_stats 
        (query_type, execution_time_ms, rows_examined, rows_returned, index_used)
        VALUES (?, ?, ?, ?, ?)
      `, [
        stats.queryType,
        stats.executionTimeMs,
        stats.rowsExamined,
        stats.rowsReturned,
        stats.indexUsed
      ], (err) => {
        if (err) {
          this.logger.debug('Failed to store query stats:', err.message);
          resolve(); // Don't fail the main query for stats issues
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Update in-memory statistics
   * @param {string} queryType - Type of query
   * @param {number} executionTimeMs - Execution time
   * @param {string} indexUsed - Index used
   * @param {boolean} success - Whether query succeeded
   */
  updateInMemoryStats(queryType, executionTimeMs, indexUsed, success) {
    // Update query type statistics
    if (!this.queryStats.has(queryType)) {
      this.queryStats.set(queryType, {
        count: 0,
        totalTime: 0,
        avgTime: 0,
        minTime: Infinity,
        maxTime: 0,
        successCount: 0,
        errorCount: 0
      });
    }
    
    const stats = this.queryStats.get(queryType);
    stats.count++;
    stats.totalTime += executionTimeMs;
    stats.avgTime = stats.totalTime / stats.count;
    stats.minTime = Math.min(stats.minTime, executionTimeMs);
    stats.maxTime = Math.max(stats.maxTime, executionTimeMs);
    
    if (success) {
      stats.successCount++;
    } else {
      stats.errorCount++;
    }
    
    // Update index usage statistics
    if (!this.indexUsageStats.has(indexUsed)) {
      this.indexUsageStats.set(indexUsed, {
        count: 0,
        totalTime: 0,
        avgTime: 0
      });
    }
    
    const indexStats = this.indexUsageStats.get(indexUsed);
    indexStats.count++;
    indexStats.totalTime += executionTimeMs;
    indexStats.avgTime = indexStats.totalTime / indexStats.count;
  }

  /**
   * Get performance statistics
   * @returns {Promise<Object>} Performance statistics
   */
  async getPerformanceStats() {
    try {
      const [queryTypeStats, indexUsageStats, slowQueries, recentStats] = await Promise.all([
        this.getQueryTypeStats(),
        this.getIndexUsageStats(),
        this.getSlowQueries(),
        this.getRecentStats()
      ]);
      
      return {
        queryTypes: queryTypeStats,
        indexUsage: indexUsageStats,
        slowQueries,
        recentStats,
        inMemoryStats: {
          queryStats: Object.fromEntries(this.queryStats),
          indexUsageStats: Object.fromEntries(this.indexUsageStats)
        }
      };
    } catch (error) {
      this.logger.error('Failed to get performance stats:', error.message);
      return {
        queryTypes: [],
        indexUsage: [],
        slowQueries: [],
        recentStats: [],
        inMemoryStats: {
          queryStats: Object.fromEntries(this.queryStats),
          indexUsageStats: Object.fromEntries(this.indexUsageStats)
        }
      };
    }
  }

  /**
   * Get query type statistics from database
   * @returns {Promise<Array>} Query type statistics
   */
  async getQueryTypeStats() {
    return new Promise((resolve, reject) => {
      this.db.all(`
        SELECT 
          query_type,
          COUNT(*) as query_count,
          AVG(execution_time_ms) as avg_time,
          MIN(execution_time_ms) as min_time,
          MAX(execution_time_ms) as max_time,
          SUM(execution_time_ms) as total_time,
          AVG(rows_examined) as avg_rows_examined,
          AVG(rows_returned) as avg_rows_returned
        FROM geolocation_query_stats 
        WHERE timestamp > datetime('now', '-24 hours')
        GROUP BY query_type
        ORDER BY query_count DESC
      `, (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
  }

  /**
   * Get index usage statistics from database
   * @returns {Promise<Array>} Index usage statistics
   */
  async getIndexUsageStats() {
    return new Promise((resolve, reject) => {
      this.db.all(`
        SELECT 
          index_used,
          COUNT(*) as usage_count,
          AVG(execution_time_ms) as avg_time,
          AVG(rows_examined) as avg_rows_examined
        FROM geolocation_query_stats 
        WHERE timestamp > datetime('now', '-24 hours')
        GROUP BY index_used
        ORDER BY usage_count DESC
      `, (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
  }

  /**
   * Get slow queries from database
   * @returns {Promise<Array>} Slow queries
   */
  async getSlowQueries() {
    return new Promise((resolve, reject) => {
      this.db.all(`
        SELECT 
          query_type,
          execution_time_ms,
          rows_examined,
          rows_returned,
          index_used,
          timestamp
        FROM geolocation_query_stats 
        WHERE execution_time_ms > ? 
        AND timestamp > datetime('now', '-24 hours')
        ORDER BY execution_time_ms DESC
        LIMIT 20
      `, [this.slowQueryThreshold], (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
  }

  /**
   * Get recent statistics
   * @returns {Promise<Array>} Recent statistics
   */
  async getRecentStats() {
    return new Promise((resolve, reject) => {
      this.db.all(`
        SELECT 
          datetime(timestamp, 'start of hour') as hour,
          COUNT(*) as query_count,
          AVG(execution_time_ms) as avg_time,
          COUNT(CASE WHEN index_used = 'table_scan' THEN 1 END) as table_scans
        FROM geolocation_query_stats 
        WHERE timestamp > datetime('now', '-24 hours')
        GROUP BY datetime(timestamp, 'start of hour')
        ORDER BY hour DESC
        LIMIT 24
      `, (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
  }

  /**
   * Analyze index effectiveness
   * @returns {Promise<Object>} Index analysis
   */
  async analyzeIndexEffectiveness() {
    try {
      const stats = await this.getPerformanceStats();
      const analysis = {
        recommendations: [],
        indexEfficiency: {},
        queryOptimizations: []
      };
      
      // Analyze index usage
      for (const indexStat of stats.indexUsage) {
        const efficiency = this.calculateIndexEfficiency(indexStat);
        analysis.indexEfficiency[indexStat.index_used] = efficiency;
        
        if (indexStat.index_used === 'table_scan' && indexStat.usage_count > 10) {
          analysis.recommendations.push({
            type: 'missing_index',
            message: `High number of table scans detected (${indexStat.usage_count}). Consider adding appropriate indexes.`,
            priority: 'high'
          });
        }
        
        if (indexStat.avg_time > this.slowQueryThreshold) {
          analysis.recommendations.push({
            type: 'slow_index',
            message: `Index ${indexStat.index_used} has slow average query time (${indexStat.avg_time.toFixed(2)}ms).`,
            priority: 'medium'
          });
        }
      }
      
      // Analyze query patterns
      for (const queryStat of stats.queryTypes) {
        if (queryStat.avg_time > this.slowQueryThreshold) {
          analysis.queryOptimizations.push({
            queryType: queryStat.query_type,
            issue: 'slow_average_time',
            avgTime: queryStat.avg_time,
            recommendation: 'Consider optimizing query or adding specific indexes'
          });
        }
      }
      
      return analysis;
    } catch (error) {
      this.logger.error('Failed to analyze index effectiveness:', error.message);
      return {
        recommendations: [],
        indexEfficiency: {},
        queryOptimizations: []
      };
    }
  }

  /**
   * Calculate index efficiency score
   * @param {Object} indexStat - Index statistics
   * @returns {number} Efficiency score (0-100)
   */
  calculateIndexEfficiency(indexStat) {
    if (indexStat.index_used === 'table_scan') {
      return 0; // Table scans are inefficient
    }
    
    // Base efficiency on average time and rows examined
    const timeScore = Math.max(0, 100 - (indexStat.avg_time / 10)); // 10ms = 90 points
    const rowsScore = Math.max(0, 100 - (indexStat.avg_rows_examined / 10)); // 10 rows = 90 points
    
    return Math.round((timeScore + rowsScore) / 2);
  }

  /**
   * Run index maintenance
   * @returns {Promise<void>}
   */
  async runIndexMaintenance() {
    try {
      this.logger.info('Starting index maintenance...');
      
      // Analyze database
      await this.analyzeDatabase();
      
      // Reindex if needed
      await this.reindexIfNeeded();
      
      // Update statistics
      await this.updateStatistics();
      
      this.logger.info('Index maintenance completed');
      
    } catch (error) {
      this.logger.error('Index maintenance failed:', error.message);
      throw error;
    }
  }

  /**
   * Analyze database structure
   * @returns {Promise<void>}
   */
  async analyzeDatabase() {
    return new Promise((resolve, reject) => {
      this.db.run('ANALYZE', (err) => {
        if (err) {
          this.logger.warn('Database analysis failed:', err.message);
          resolve(); // Don't fail maintenance for this
        } else {
          this.logger.debug('Database analysis completed');
          resolve();
        }
      });
    });
  }

  /**
   * Reindex if needed
   * @returns {Promise<void>}
   */
  async reindexIfNeeded() {
    return new Promise((resolve, reject) => {
      this.db.run('REINDEX', (err) => {
        if (err) {
          this.logger.warn('Database reindex failed:', err.message);
          resolve(); // Don't fail maintenance for this
        } else {
          this.logger.debug('Database reindex completed');
          resolve();
        }
      });
    });
  }

  /**
   * Update database statistics
   * @returns {Promise<void>}
   */
  async updateStatistics() {
    return new Promise((resolve, reject) => {
      this.db.run('PRAGMA optimize', (err) => {
        if (err) {
          this.logger.warn('Statistics update failed:', err.message);
          resolve(); // Don't fail maintenance for this
        } else {
          this.logger.debug('Statistics update completed');
          resolve();
        }
      });
    });
  }

  /**
   * Clean old statistics
   * @param {number} daysToKeep - Number of days to keep statistics
   * @returns {Promise<void>}
   */
  async cleanOldStats(daysToKeep = 30) {
    return new Promise((resolve, reject) => {
      this.db.run(`
        DELETE FROM geolocation_query_stats 
        WHERE timestamp < datetime('now', '-${daysToKeep} days')
      `, (err) => {
        if (err) {
          this.logger.warn('Failed to clean old statistics:', err.message);
          resolve(); // Don't fail for cleanup issues
        } else {
          this.logger.debug(`Cleaned statistics older than ${daysToKeep} days`);
          resolve();
        }
      });
    });
  }
}

export default DatabasePerformanceMonitor;