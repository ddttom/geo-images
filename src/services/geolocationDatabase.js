/**
 * Geolocation Database Service
 * 
 * Manages GPS coordinate storage and retrieval with optional SQLite persistence.
 * Provides priority-based GPS source management and incremental processing.
 * Enhanced with comprehensive database optimization, indexing, and performance monitoring.
 * 
 * @author Tom Cranstoun <ddttom@github.com>
 */

import { writeFile, readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import sqlite3 from 'sqlite3';
import { validateCoordinates } from '../utils/coordinates.js';
import DatabaseMigrationService from './databaseMigration.js';
import DatabasePerformanceMonitor from './databasePerformanceMonitor.js';

/**
 * Service for geolocation database operations
 */
class GeolocationDatabaseService {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
    this.inMemoryDb = new Map();
    this.sqliteDb = null;
    this.migrationService = null;
    this.performanceMonitor = null;
    
    // GPS source priorities (higher = more trusted)
    this.sourcePriorities = {
      'image_exif': 100,
      'database_cached': 90,
      'timeline_exact': 80,
      'timeline_interpolation': 70,
      'nearby_images': 60,
      'enhanced_fallback': 50,
      'spatial_interpolation': 40
    };
  }

  /**
   * Initialize the database
   * @returns {Promise<void>}
   */
  async initialize() {
    this.logger.info('Initializing geolocation database...');
    
    try {
      // Load existing data from JSON export if available
      await this.loadExistingData();
      
      // Initialize SQLite if enabled
      if (this.config.enableSqlitePersistence) {
        await this.initializeSQLite();
      }
      
      this.logger.info(`Database initialized with ${this.inMemoryDb.size} records`);
      
    } catch (error) {
      this.logger.error('Failed to initialize database:', error.message);
      throw error;
    }
  }

  /**
   * Initialize SQLite database with migrations and performance monitoring
   * @returns {Promise<void>}
   */
  async initializeSQLite() {
    return new Promise(async (resolve, reject) => {
      const dbPath = join(process.cwd(), 'data', 'geolocation.db');
      
      this.sqliteDb = new sqlite3.Database(dbPath, async (err) => {
        if (err) {
          this.logger.error('SQLite initialization failed:', err.message);
          reject(err);
          return;
        }
        
        try {
          // Initialize migration service
          this.migrationService = new DatabaseMigrationService(this.logger);
          
          // Run database migrations (includes index creation)
          await this.migrationService.runMigrations(this.sqliteDb);
          
          // Initialize performance monitoring
          this.performanceMonitor = new DatabasePerformanceMonitor(this.sqliteDb, this.logger);
          
          // Enable SQLite optimizations
          await this.enableSQLiteOptimizations();
          
          this.logger.debug('SQLite database ready with optimized indexes');
          resolve();
          
        } catch (migrationError) {
          this.logger.error('Database migration failed:', migrationError.message);
          reject(migrationError);
        }
      });
    });
  }

  /**
   * Enable SQLite performance optimizations
   * @returns {Promise<void>}
   */
  async enableSQLiteOptimizations() {
    const optimizations = [
      'PRAGMA journal_mode = WAL',           // Write-Ahead Logging for better concurrency
      'PRAGMA synchronous = NORMAL',         // Balance between safety and performance
      'PRAGMA cache_size = 10000',           // Increase cache size (10MB)
      'PRAGMA temp_store = MEMORY',          // Store temporary tables in memory
      'PRAGMA mmap_size = 268435456',        // Enable memory-mapped I/O (256MB)
      'PRAGMA optimize'                      // Update query planner statistics
    ];

    for (const pragma of optimizations) {
      try {
        await new Promise((resolve, reject) => {
          this.sqliteDb.run(pragma, (err) => {
            if (err) {
              this.logger.warn(`Failed to apply optimization: ${pragma}`, err.message);
              resolve(); // Don't fail initialization for optimization issues
            } else {
              resolve();
            }
          });
        });
      } catch (error) {
        this.logger.warn(`Optimization failed: ${pragma}`, error.message);
      }
    }
  }

  /**
   * Load existing data from JSON export
   * @returns {Promise<void>}
   */
  async loadExistingData() {
    const exportPath = this.config.exportPath || 'data/geolocation-export.json';
    
    try {
      if (existsSync(exportPath)) {
        const jsonData = await readFile(exportPath, 'utf8');
        const records = JSON.parse(jsonData);
        
        records.forEach(record => {
          if (record.filePath && record.latitude && record.longitude) {
            this.inMemoryDb.set(record.filePath, {
              latitude: record.latitude,
              longitude: record.longitude,
              source: record.source || 'unknown',
              accuracy: record.accuracy || null,
              confidence: record.confidence || null,
              timestamp: new Date(record.timestamp || Date.now())
            });
          }
        });
        
        this.logger.info(`Loaded ${records.length} existing records from JSON export`);
      }
    } catch (error) {
      this.logger.warn('Failed to load existing data:', error.message);
    }
  }

  /**
   * Store GPS coordinates for a file with performance monitoring
   * @param {string} filePath - File path
   * @param {Object} coordinates - GPS coordinates
   * @param {string} source - Source of coordinates
   * @param {Object} metadata - Additional metadata
   * @param {Date} originalTimestamp - Original image timestamp (optional, defaults to current time)
   * @returns {Promise<boolean>} Success status
   */
  async storeCoordinates(filePath, coordinates, source, metadata = {}, originalTimestamp = null) {
    try {
      // Validate coordinates
      if (this.config.validateCoordinates) {
        if (!validateCoordinates(coordinates.latitude, coordinates.longitude)) {
          throw new Error('Invalid coordinates');
        }
      }
      
      // Check if we should update based on source priority
      const existing = this.inMemoryDb.get(filePath);
      const newPriority = this.sourcePriorities[source] || 0;
      const existingPriority = existing ? (this.sourcePriorities[existing.source] || 0) : -1;
      
      if (existing && existingPriority >= newPriority) {
        this.logger.debug(`Skipping lower priority update for ${filePath}: ${source} (${newPriority}) vs ${existing.source} (${existingPriority})`);
        return false;
      }
      
      // Use original timestamp if provided, otherwise fall back to current time
      const timestampToUse = originalTimestamp || new Date();
      
      // Store in memory
      const record = {
        latitude: coordinates.latitude,
        longitude: coordinates.longitude,
        source,
        accuracy: coordinates.accuracy || metadata.accuracy || null,
        confidence: coordinates.confidence || metadata.confidence || null,
        timestamp: timestampToUse
      };
      
      this.inMemoryDb.set(filePath, record);
      
      // Store in SQLite if enabled with performance monitoring
      if (this.sqliteDb && this.performanceMonitor) {
        await this.performanceMonitor.monitorQuery(
          'coordinate_store',
          'INSERT OR REPLACE INTO geolocation (file_path, latitude, longitude, source, accuracy, confidence, timestamp, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)',
          [filePath, record.latitude, record.longitude, record.source, record.accuracy, record.confidence, record.timestamp.toISOString()],
          () => this.storeSQLite(filePath, record)
        );
      } else if (this.sqliteDb) {
        await this.storeSQLite(filePath, record);
      }
      
      this.logger.debug(`Stored coordinates for ${filePath} from ${source} with timestamp ${timestampToUse.toISOString()}`);
      return true;
      
    } catch (error) {
      this.logger.error(`Failed to store coordinates for ${filePath}:`, error.message);
      throw error;
    }
  }

  /**
   * Store record in SQLite database
   * @param {string} filePath - File path
   * @param {Object} record - GPS record
   * @returns {Promise<void>}
   */
  async storeSQLite(filePath, record) {
    return new Promise((resolve, reject) => {
      const stmt = this.sqliteDb.prepare(`
        INSERT OR REPLACE INTO geolocation 
        (file_path, latitude, longitude, source, accuracy, confidence, timestamp, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `);
      
      stmt.run([
        filePath,
        record.latitude,
        record.longitude,
        record.source,
        record.accuracy,
        record.confidence,
        record.timestamp.toISOString()
      ], (err) => {
        if (err) {
          this.logger.error('SQLite insert failed:', err.message);
          reject(err);
        } else {
          resolve();
        }
      });
      
      stmt.finalize();
    });
  }

  /**
   * Get GPS coordinates for a file with performance monitoring
   * @param {string} filePath - File path
   * @returns {Promise<Object|null>} GPS coordinates or null
   */
  async getCoordinates(filePath) {
    // Check in-memory database first
    const memoryRecord = this.inMemoryDb.get(filePath);
    if (memoryRecord) {
      return {
        latitude: memoryRecord.latitude,
        longitude: memoryRecord.longitude,
        source: memoryRecord.source,
        accuracy: memoryRecord.accuracy,
        confidence: memoryRecord.confidence
      };
    }
    
    // Check SQLite if enabled and not in memory with performance monitoring
    if (this.sqliteDb && this.performanceMonitor) {
      const sqliteRecord = await this.performanceMonitor.monitorQuery(
        'coordinate_lookup',
        'SELECT * FROM geolocation WHERE file_path = ?',
        [filePath],
        () => this.getSQLite(filePath)
      );
      
      if (sqliteRecord) {
        // Cache in memory for future lookups
        this.inMemoryDb.set(filePath, sqliteRecord);
        return sqliteRecord;
      }
    } else if (this.sqliteDb) {
      const sqliteRecord = await this.getSQLite(filePath);
      if (sqliteRecord) {
        // Cache in memory for future lookups
        this.inMemoryDb.set(filePath, sqliteRecord);
        return sqliteRecord;
      }
    }
    
    return null;
  }

  /**
   * Get record from SQLite database
   * @param {string} filePath - File path
   * @returns {Promise<Object|null>} GPS record or null
   */
  async getSQLite(filePath) {
    return new Promise((resolve, reject) => {
      this.sqliteDb.get(
        'SELECT * FROM geolocation WHERE file_path = ?',
        [filePath],
        (err, row) => {
          if (err) {
            this.logger.error('SQLite query failed:', err.message);
            reject(err);
          } else if (row) {
            resolve({
              latitude: row.latitude,
              longitude: row.longitude,
              source: row.source,
              accuracy: row.accuracy,
              confidence: row.confidence,
              timestamp: new Date(row.timestamp)
            });
          } else {
            resolve(null);
          }
        }
      );
    });
  }

  /**
   * Find coordinates by timestamp range with optimized query
   * @param {Date} targetTimestamp - Target timestamp
   * @param {number} toleranceMinutes - Tolerance in minutes
   * @returns {Promise<Array>} Matching coordinates
   */
  async findCoordinatesByTimeRange(targetTimestamp, toleranceMinutes = 60) {
    if (!this.sqliteDb || !this.performanceMonitor) {
      return [];
    }

    const startTime = new Date(targetTimestamp.getTime() - (toleranceMinutes * 60 * 1000));
    const endTime = new Date(targetTimestamp.getTime() + (toleranceMinutes * 60 * 1000));

    return await this.performanceMonitor.monitorQuery(
      'timeline_search',
      `SELECT * FROM geolocation 
       WHERE timestamp BETWEEN ? AND ? 
       ORDER BY ABS(julianday(timestamp) - julianday(?)) ASC 
       LIMIT 10`,
      [startTime.toISOString(), endTime.toISOString(), targetTimestamp.toISOString()],
      () => this.executeTimeRangeQuery(startTime, endTime, targetTimestamp)
    );
  }

  /**
   * Execute time range query
   * @param {Date} startTime - Start time
   * @param {Date} endTime - End time
   * @param {Date} targetTimestamp - Target timestamp
   * @returns {Promise<Array>} Query results
   */
  async executeTimeRangeQuery(startTime, endTime, targetTimestamp) {
    return new Promise((resolve, reject) => {
      this.sqliteDb.all(
        `SELECT * FROM geolocation 
         WHERE timestamp BETWEEN ? AND ? 
         ORDER BY ABS(julianday(timestamp) - julianday(?)) ASC 
         LIMIT 10`,
        [startTime.toISOString(), endTime.toISOString(), targetTimestamp.toISOString()],
        (err, rows) => {
          if (err) {
            this.logger.error('Time range query failed:', err.message);
            reject(err);
          } else {
            resolve(rows || []);
          }
        }
      );
    });
  }

  /**
   * Find coordinates by geographic proximity with spatial indexing
   * @param {number} latitude - Target latitude
   * @param {number} longitude - Target longitude
   * @param {number} radiusKm - Search radius in kilometers
   * @returns {Promise<Array>} Nearby coordinates
   */
  async findCoordinatesByProximity(latitude, longitude, radiusKm = 1) {
    if (!this.sqliteDb || !this.performanceMonitor) {
      return [];
    }

    // Use spatial grid index for efficient proximity search
    const gridLat = Math.floor(latitude * 1000);
    const gridLon = Math.floor(longitude * 1000);
    const gridRadius = Math.ceil(radiusKm * 1000 / 111); // Approximate grid cells for radius

    return await this.performanceMonitor.monitorQuery(
      'proximity_search',
      `SELECT *, 
       (6371 * acos(cos(radians(?)) * cos(radians(latitude)) * cos(radians(longitude) - radians(?)) + sin(radians(?)) * sin(radians(latitude)))) AS distance
       FROM geolocation 
       WHERE CAST(latitude * 1000 AS INTEGER) BETWEEN ? AND ?
       AND CAST(longitude * 1000 AS INTEGER) BETWEEN ? AND ?
       HAVING distance <= ?
       ORDER BY distance ASC
       LIMIT 20`,
      [latitude, longitude, latitude, gridLat - gridRadius, gridLat + gridRadius, gridLon - gridRadius, gridLon + gridRadius, radiusKm],
      () => this.executeProximityQuery(latitude, longitude, gridLat, gridLon, gridRadius, radiusKm)
    );
  }

  /**
   * Execute proximity query
   * @param {number} latitude - Target latitude
   * @param {number} longitude - Target longitude
   * @param {number} gridLat - Grid latitude
   * @param {number} gridLon - Grid longitude
   * @param {number} gridRadius - Grid radius
   * @param {number} radiusKm - Radius in kilometers
   * @returns {Promise<Array>} Query results
   */
  async executeProximityQuery(latitude, longitude, gridLat, gridLon, gridRadius, radiusKm) {
    return new Promise((resolve, reject) => {
      this.sqliteDb.all(
        `SELECT *, 
         (6371 * acos(cos(radians(?)) * cos(radians(latitude)) * cos(radians(longitude) - radians(?)) + sin(radians(?)) * sin(radians(latitude)))) AS distance
         FROM geolocation 
         WHERE CAST(latitude * 1000 AS INTEGER) BETWEEN ? AND ?
         AND CAST(longitude * 1000 AS INTEGER) BETWEEN ? AND ?
         HAVING distance <= ?
         ORDER BY distance ASC
         LIMIT 20`,
        [latitude, longitude, latitude, gridLat - gridRadius, gridLat + gridRadius, gridLon - gridRadius, gridLon + gridRadius, radiusKm],
        (err, rows) => {
          if (err) {
            this.logger.error('Proximity query failed:', err.message);
            reject(err);
          } else {
            resolve(rows || []);
          }
        }
      );
    });
  }

  /**
   * Check if file has GPS coordinates
   * @param {string} filePath - File path
   * @returns {Promise<boolean>} True if coordinates exist
   */
  async hasCoordinates(filePath) {
    const coordinates = await this.getCoordinates(filePath);
    return !!coordinates;
  }

  /**
   * Get all stored coordinates
   * @returns {Promise<Array>} Array of all GPS records
   */
  async getAllCoordinates() {
    const records = [];
    
    for (const [filePath, record] of this.inMemoryDb) {
      records.push({
        filePath,
        latitude: record.latitude,
        longitude: record.longitude,
        source: record.source,
        accuracy: record.accuracy,
        confidence: record.confidence,
        timestamp: record.timestamp.toISOString()
      });
    }
    
    return records;
  }

  /**
   * Export database to JSON file
   * @returns {Promise<void>}
   */
  async exportDatabase() {
    try {
      const records = await this.getAllCoordinates();
      const exportPath = this.config.exportPath || 'data/geolocation-export.json';
      
      const jsonData = JSON.stringify(records, null, 2);
      await writeFile(exportPath, jsonData, 'utf8');
      
      this.logger.info(`Exported ${records.length} records to ${exportPath}`);
      
    } catch (error) {
      this.logger.error('Failed to export database:', error.message);
      throw error;
    }
  }

  /**
   * Get database statistics with performance metrics
   * @returns {Promise<Object>} Database statistics
   */
  async getStatistics() {
    const records = await this.getAllCoordinates();
    const sources = {};
    const accuracyStats = [];
    const confidenceStats = [];
    
    records.forEach(record => {
      // Count by source
      sources[record.source] = (sources[record.source] || 0) + 1;
      
      // Collect accuracy data
      if (record.accuracy !== null) {
        accuracyStats.push(record.accuracy);
      }
      
      // Collect confidence data
      if (record.confidence !== null) {
        confidenceStats.push(record.confidence);
      }
    });

    const stats = {
      totalRecords: records.length,
      sources,
      accuracy: this.calculateStats(accuracyStats),
      confidence: this.calculateStats(confidenceStats),
      memoryRecords: this.inMemoryDb.size,
      sqliteEnabled: !!this.sqliteDb
    };

    // Add performance statistics if available
    if (this.performanceMonitor) {
      try {
        const performanceStats = await this.performanceMonitor.getPerformanceStats();
        stats.performance = performanceStats;
      } catch (error) {
        this.logger.debug('Failed to get performance stats:', error.message);
      }
    }

    return stats;
  }

  /**
   * Calculate basic statistics for an array of numbers
   * @param {Array} values - Array of numeric values
   * @returns {Object} Statistics
   */
  calculateStats(values) {
    if (values.length === 0) return null;
    
    const sorted = values.sort((a, b) => a - b);
    const sum = values.reduce((a, b) => a + b, 0);
    
    return {
      count: values.length,
      min: sorted[0],
      max: sorted[sorted.length - 1],
      mean: sum / values.length,
      median: sorted[Math.floor(sorted.length / 2)]
    };
  }

  /**
   * Remove coordinates for a file
   * @param {string} filePath - File path
   * @returns {Promise<boolean>} Success status
   */
  async removeCoordinates(filePath) {
    try {
      // Remove from memory
      const removed = this.inMemoryDb.delete(filePath);
      
      // Remove from SQLite if enabled
      if (this.sqliteDb) {
        await this.removeSQLite(filePath);
      }
      
      this.logger.debug(`Removed coordinates for ${filePath}`);
      return removed;
      
    } catch (error) {
      this.logger.error(`Failed to remove coordinates for ${filePath}:`, error.message);
      throw error;
    }
  }

  /**
   * Remove record from SQLite database
   * @param {string} filePath - File path
   * @returns {Promise<void>}
   */
  async removeSQLite(filePath) {
    return new Promise((resolve, reject) => {
      this.sqliteDb.run(
        'DELETE FROM geolocation WHERE file_path = ?',
        [filePath],
        (err) => {
          if (err) {
            this.logger.error('SQLite delete failed:', err.message);
            reject(err);
          } else {
            resolve();
          }
        }
      );
    });
  }

  /**
   * Clear all data
   * @returns {Promise<void>}
   */
  async clearAll() {
    try {
      // Clear memory
      this.inMemoryDb.clear();
      
      // Clear SQLite if enabled
      if (this.sqliteDb) {
        await this.clearSQLite();
      }
      
      this.logger.info('Cleared all geolocation data');
      
    } catch (error) {
      this.logger.error('Failed to clear data:', error.message);
      throw error;
    }
  }

  /**
   * Clear SQLite database
   * @returns {Promise<void>}
   */
  async clearSQLite() {
    return new Promise((resolve, reject) => {
      this.sqliteDb.run('DELETE FROM geolocation', (err) => {
        if (err) {
          this.logger.error('SQLite clear failed:', err.message);
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Run database maintenance
   * @returns {Promise<void>}
   */
  async runMaintenance() {
    if (this.performanceMonitor) {
      try {
        await this.performanceMonitor.runIndexMaintenance();
        await this.performanceMonitor.cleanOldStats(30); // Keep 30 days of stats
        this.logger.info('Database maintenance completed');
      } catch (error) {
        this.logger.error('Database maintenance failed:', error.message);
      }
    }
  }

  /**
   * Get performance analysis
   * @returns {Promise<Object>} Performance analysis
   */
  async getPerformanceAnalysis() {
    if (this.performanceMonitor) {
      try {
        return await this.performanceMonitor.analyzeIndexEffectiveness();
      } catch (error) {
        this.logger.error('Performance analysis failed:', error.message);
        return { recommendations: [], indexEfficiency: {}, queryOptimizations: [] };
      }
    }
    return { recommendations: [], indexEfficiency: {}, queryOptimizations: [] };
  }

  /**
   * Close database connections
   * @returns {Promise<void>}
   */
  async close() {
    if (this.sqliteDb) {
      return new Promise((resolve) => {
        this.sqliteDb.close((err) => {
          if (err) {
            this.logger.error('Failed to close SQLite database:', err.message);
          } else {
            this.logger.debug('SQLite database closed');
          }
          resolve();
        });
      });
    }
  }
}

export default GeolocationDatabaseService;