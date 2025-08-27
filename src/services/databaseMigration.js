/**
 * Database Migration Service
 * 
 * Handles safe database schema migrations and index creation for SQLite optimization.
 * Provides version control and rollback capabilities for database changes.
 * 
 * @author Tom Cranstoun <ddttom@github.com>
 */

import { join } from 'path';
import sqlite3 from 'sqlite3';

/**
 * Database migration service for safe schema updates
 */
class DatabaseMigrationService {
  constructor(logger) {
    this.logger = logger;
    this.currentVersion = 2; // Updated version for optimized schema
    this.migrations = new Map();
    this.setupMigrations();
  }

  /**
   * Setup migration definitions
   */
  setupMigrations() {
    // Migration 1: Initial schema (existing)
    this.migrations.set(1, {
      name: 'initial_schema',
      up: `
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
        );
      `,
      down: 'DROP TABLE IF EXISTS geolocation;'
    });

    // Migration 2: Comprehensive index optimization
    this.migrations.set(2, {
      name: 'comprehensive_index_optimization',
      up: `
        -- Composite indexes for multi-column query patterns
        CREATE INDEX IF NOT EXISTS idx_geolocation_source_timestamp 
        ON geolocation(source, timestamp);
        
        CREATE INDEX IF NOT EXISTS idx_geolocation_lat_lon_timestamp 
        ON geolocation(latitude, longitude, timestamp);
        
        CREATE INDEX IF NOT EXISTS idx_geolocation_timestamp_source 
        ON geolocation(timestamp, source);
        
        -- Covering indexes to eliminate table lookups
        CREATE INDEX IF NOT EXISTS idx_geolocation_covering_coords 
        ON geolocation(file_path, latitude, longitude, accuracy, confidence);
        
        CREATE INDEX IF NOT EXISTS idx_geolocation_covering_temporal 
        ON geolocation(timestamp, source, latitude, longitude, accuracy);
        
        -- Temporal indexes for timestamp-based range queries
        CREATE INDEX IF NOT EXISTS idx_geolocation_timestamp_range 
        ON geolocation(timestamp);
        
        CREATE INDEX IF NOT EXISTS idx_geolocation_created_at 
        ON geolocation(created_at);
        
        CREATE INDEX IF NOT EXISTS idx_geolocation_updated_at 
        ON geolocation(updated_at);
        
        -- Spatial indexes for geographic proximity searches
        CREATE INDEX IF NOT EXISTS idx_geolocation_latitude 
        ON geolocation(latitude);
        
        CREATE INDEX IF NOT EXISTS idx_geolocation_longitude 
        ON geolocation(longitude);
        
        CREATE INDEX IF NOT EXISTS idx_geolocation_spatial_grid 
        ON geolocation(
          CAST(latitude * 1000 AS INTEGER), 
          CAST(longitude * 1000 AS INTEGER)
        );
        
        -- Partial indexes for filtered queries on specific GPS sources
        CREATE INDEX IF NOT EXISTS idx_geolocation_high_priority_sources 
        ON geolocation(timestamp, latitude, longitude) 
        WHERE source IN ('image_exif', 'database_cached', 'timeline_exact');
        
        CREATE INDEX IF NOT EXISTS idx_geolocation_high_confidence 
        ON geolocation(timestamp, latitude, longitude) 
        WHERE confidence > 0.8;
        
        CREATE INDEX IF NOT EXISTS idx_geolocation_high_accuracy 
        ON geolocation(timestamp, latitude, longitude) 
        WHERE accuracy IS NOT NULL AND accuracy < 100;
        
        -- Expression-based indexes for computed timestamp tolerances
        CREATE INDEX IF NOT EXISTS idx_geolocation_timestamp_hour 
        ON geolocation(datetime(timestamp, 'start of hour'));
        
        CREATE INDEX IF NOT EXISTS idx_geolocation_timestamp_day 
        ON geolocation(date(timestamp));
        
        -- Unique constraint indexes for data integrity
        CREATE UNIQUE INDEX IF NOT EXISTS idx_geolocation_unique_file_path 
        ON geolocation(file_path);
        
        -- Performance monitoring table
        CREATE TABLE IF NOT EXISTS geolocation_query_stats (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          query_type TEXT NOT NULL,
          execution_time_ms REAL NOT NULL,
          rows_examined INTEGER,
          rows_returned INTEGER,
          index_used TEXT,
          timestamp TEXT DEFAULT CURRENT_TIMESTAMP
        );
        
        CREATE INDEX IF NOT EXISTS idx_query_stats_type_timestamp 
        ON geolocation_query_stats(query_type, timestamp);
      `,
      down: `
        DROP INDEX IF EXISTS idx_geolocation_source_timestamp;
        DROP INDEX IF EXISTS idx_geolocation_lat_lon_timestamp;
        DROP INDEX IF EXISTS idx_geolocation_timestamp_source;
        DROP INDEX IF EXISTS idx_geolocation_covering_coords;
        DROP INDEX IF EXISTS idx_geolocation_covering_temporal;
        DROP INDEX IF EXISTS idx_geolocation_timestamp_range;
        DROP INDEX IF EXISTS idx_geolocation_created_at;
        DROP INDEX IF EXISTS idx_geolocation_updated_at;
        DROP INDEX IF EXISTS idx_geolocation_latitude;
        DROP INDEX IF EXISTS idx_geolocation_longitude;
        DROP INDEX IF EXISTS idx_geolocation_spatial_grid;
        DROP INDEX IF EXISTS idx_geolocation_high_priority_sources;
        DROP INDEX IF EXISTS idx_geolocation_high_confidence;
        DROP INDEX IF EXISTS idx_geolocation_high_accuracy;
        DROP INDEX IF EXISTS idx_geolocation_timestamp_hour;
        DROP INDEX IF EXISTS idx_geolocation_timestamp_day;
        DROP INDEX IF EXISTS idx_geolocation_unique_file_path;
        DROP TABLE IF EXISTS geolocation_query_stats;
      `
    });
  }

  /**
   * Run database migrations
   * @param {sqlite3.Database} db - SQLite database instance
   * @returns {Promise<void>}
   */
  async runMigrations(db) {
    try {
      // Create migration tracking table
      await this.createMigrationTable(db);
      
      // Get current database version
      const currentDbVersion = await this.getCurrentVersion(db);
      this.logger.info(`Current database version: ${currentDbVersion}`);
      
      // Run pending migrations
      for (let version = currentDbVersion + 1; version <= this.currentVersion; version++) {
        const migration = this.migrations.get(version);
        if (migration) {
          this.logger.info(`Running migration ${version}: ${migration.name}`);
          await this.runMigration(db, version, migration);
          this.logger.info(`Migration ${version} completed successfully`);
        }
      }
      
      this.logger.info(`Database migrations completed. Current version: ${this.currentVersion}`);
      
    } catch (error) {
      this.logger.error('Migration failed:', error.message);
      throw error;
    }
  }

  /**
   * Create migration tracking table
   * @param {sqlite3.Database} db - SQLite database instance
   * @returns {Promise<void>}
   */
  async createMigrationTable(db) {
    return new Promise((resolve, reject) => {
      db.run(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          version INTEGER PRIMARY KEY,
          name TEXT NOT NULL,
          applied_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  /**
   * Get current database version
   * @param {sqlite3.Database} db - SQLite database instance
   * @returns {Promise<number>}
   */
  async getCurrentVersion(db) {
    return new Promise((resolve, reject) => {
      db.get(
        'SELECT MAX(version) as version FROM schema_migrations',
        (err, row) => {
          if (err) reject(err);
          else resolve(row?.version || 0);
        }
      );
    });
  }

  /**
   * Run a single migration
   * @param {sqlite3.Database} db - SQLite database instance
   * @param {number} version - Migration version
   * @param {Object} migration - Migration definition
   * @returns {Promise<void>}
   */
  async runMigration(db, version, migration) {
    return new Promise((resolve, reject) => {
      db.serialize(() => {
        db.run('BEGIN TRANSACTION');
        
        // Execute migration SQL
        db.exec(migration.up, (err) => {
          if (err) {
            db.run('ROLLBACK');
            reject(new Error(`Migration ${version} failed: ${err.message}`));
            return;
          }
          
          // Record migration
          db.run(
            'INSERT INTO schema_migrations (version, name) VALUES (?, ?)',
            [version, migration.name],
            (err) => {
              if (err) {
                db.run('ROLLBACK');
                reject(err);
              } else {
                db.run('COMMIT', (err) => {
                  if (err) reject(err);
                  else resolve();
                });
              }
            }
          );
        });
      });
    });
  }

  /**
   * Rollback to a specific version
   * @param {sqlite3.Database} db - SQLite database instance
   * @param {number} targetVersion - Target version to rollback to
   * @returns {Promise<void>}
   */
  async rollbackTo(db, targetVersion) {
    try {
      const currentDbVersion = await this.getCurrentVersion(db);
      
      if (targetVersion >= currentDbVersion) {
        this.logger.warn(`Target version ${targetVersion} is not lower than current version ${currentDbVersion}`);
        return;
      }
      
      // Rollback migrations in reverse order
      for (let version = currentDbVersion; version > targetVersion; version--) {
        const migration = this.migrations.get(version);
        if (migration) {
          this.logger.info(`Rolling back migration ${version}: ${migration.name}`);
          await this.rollbackMigration(db, version, migration);
        }
      }
      
      this.logger.info(`Rollback completed. Current version: ${targetVersion}`);
      
    } catch (error) {
      this.logger.error('Rollback failed:', error.message);
      throw error;
    }
  }

  /**
   * Rollback a single migration
   * @param {sqlite3.Database} db - SQLite database instance
   * @param {number} version - Migration version
   * @param {Object} migration - Migration definition
   * @returns {Promise<void>}
   */
  async rollbackMigration(db, version, migration) {
    return new Promise((resolve, reject) => {
      db.serialize(() => {
        db.run('BEGIN TRANSACTION');
        
        // Execute rollback SQL
        db.exec(migration.down, (err) => {
          if (err) {
            db.run('ROLLBACK');
            reject(new Error(`Rollback ${version} failed: ${err.message}`));
            return;
          }
          
          // Remove migration record
          db.run(
            'DELETE FROM schema_migrations WHERE version = ?',
            [version],
            (err) => {
              if (err) {
                db.run('ROLLBACK');
                reject(err);
              } else {
                db.run('COMMIT', (err) => {
                  if (err) reject(err);
                  else resolve();
                });
              }
            }
          );
        });
      });
    });
  }

  /**
   * Get migration status
   * @param {sqlite3.Database} db - SQLite database instance
   * @returns {Promise<Object>}
   */
  async getMigrationStatus(db) {
    try {
      const currentVersion = await this.getCurrentVersion(db);
      const appliedMigrations = await this.getAppliedMigrations(db);
      
      return {
        currentVersion,
        latestVersion: this.currentVersion,
        isUpToDate: currentVersion === this.currentVersion,
        appliedMigrations,
        pendingMigrations: Array.from(this.migrations.keys())
          .filter(version => version > currentVersion)
          .map(version => ({
            version,
            name: this.migrations.get(version).name
          }))
      };
    } catch (error) {
      this.logger.error('Failed to get migration status:', error.message);
      throw error;
    }
  }

  /**
   * Get applied migrations
   * @param {sqlite3.Database} db - SQLite database instance
   * @returns {Promise<Array>}
   */
  async getAppliedMigrations(db) {
    return new Promise((resolve, reject) => {
      db.all(
        'SELECT version, name, applied_at FROM schema_migrations ORDER BY version',
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });
  }
}

export default DatabaseMigrationService;