/**
 * Geolocation Database Service
 * 
 * Manages GPS coordinate storage and retrieval with optional SQLite persistence.
 * Provides priority-based GPS source management and incremental processing.
 * 
 * @author Tom Cranstoun <ddttom@github.com>
 */

import { writeFile, readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import sqlite3 from 'sqlite3';
import { validateCoordinates } from '../utils/coordinates.js';

/**
 * Service for geolocation database operations
 */
class GeolocationDatabaseService {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
    this.inMemoryDb = new Map();
    this.sqliteDb = null;
    
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
   * Initialize SQLite database
   * @returns {Promise<void>}
   */
  async initializeSQLite() {
    return new Promise((resolve, reject) => {
      const dbPath = join(process.cwd(), 'data', 'geolocation.db');
      
      this.sqliteDb = new sqlite3.Database(dbPath, (err) => {
        if (err) {
          this.logger.error('SQLite initialization failed:', err.message);
          reject(err);
          return;
        }
        
        // Create table if it doesn't exist
        this.sqliteDb.run(`
          CREATE TABLE IF NOT EXISTS geolocation (
            file_path TEXT PRIMARY KEY,
            latitude REAL NOT NULL,
            longitude REAL NOT NULL,
            source TEXT NOT NULL,
            accuracy REAL,
            confidence REAL,
            timestamp TEXT NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
          )
        `, (err) => {
          if (err) {
            this.logger.error('Failed to create SQLite table:', err.message);
            reject(err);
          } else {
            this.logger.debug('SQLite database ready');
            resolve();
          }
        });
      });
    });
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
   * Store GPS coordinates for a file
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
      
      // Store in SQLite if enabled
      if (this.sqliteDb) {
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
   * Get GPS coordinates for a file
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
    
    // Check SQLite if enabled and not in memory
    if (this.sqliteDb) {
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
   * Get database statistics
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
    
    return {
      totalRecords: records.length,
      sources,
      accuracy: this.calculateStats(accuracyStats),
      confidence: this.calculateStats(confidenceStats),
      memoryRecords: this.inMemoryDb.size,
      sqliteEnabled: !!this.sqliteDb
    };
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