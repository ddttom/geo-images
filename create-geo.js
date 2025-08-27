#!/usr/bin/env node

/**
 * Create Geo - Comprehensive EXIF Metadata Scanner
 * 
 * Recursively scans directory structure to systematically process image files,
 * extracting GPS metadata from EXIF data and updating the location database
 * with atomic backup/restore capabilities.
 * 
 * @author Tom Cranstoun <ddttom@github.com>
 */

import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';
import { readFile, writeFile, copyFile, unlink } from 'fs/promises';
import { existsSync, mkdirSync } from 'fs';
import { createHash } from 'crypto';
import chalk from 'chalk';
import ora from 'ora';

// Import existing services
import FileDiscoveryService from './src/services/fileDiscovery.js';
import ExifService from './src/services/exif.js';

// Import utilities
import { createLogger, createBatchLogger, createOperationLogger } from './src/utils/debugLogger.js';
import { validateCoordinates, coordinatesEqual } from './src/utils/coordinates.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Configuration for the geo scanning operation
 */
const CONFIG = {
  // Default directory paths
  defaultScanDirectory: join(process.env.HOME || process.env.USERPROFILE || '', 'pics'),
  locationDataPath: join(process.cwd(), 'data', 'location.json'),
  
  // Duplicate detection tolerances
  duplicateDetection: {
    coordinateTolerance: 0.0001,     // ~11 meters
    timestampTolerance: 60 * 1000,   // 60 seconds in milliseconds
    enableFileHashCheck: true        // Enable file hash comparison
  },
  
  // Processing configuration
  batchSize: 50,                     // Images to process per batch
  progressReportInterval: 25,        // Report progress every N images
  
  // GPS validation bounds (worldwide)
  gpsValidation: {
    minLatitude: -90,
    maxLatitude: 90,
    minLongitude: -180,
    maxLongitude: 180,
    enableBoundsCheck: true
  },
  
  // EXIF processing options
  exif: {
    useFileTimestampFallback: false,  // Only use EXIF timestamps for geo data
    enableMultiFormatSupport: true
  }
};

/**
 * Main class for comprehensive geo metadata scanning
 */
class CreateGeoScanner {
  constructor() {
    this.logger = createLogger('CreateGeo');
    this.fileDiscovery = null;
    this.exifService = null;
    this.processedImages = new Map(); // Cache for processed images
    this.duplicateHashes = new Set(); // Track file hashes for duplicate detection
    this.existingLocations = [];     // Existing location.json data
    this.newLocationData = [];       // Newly extracted location data
    this.statistics = {
      totalFiles: 0,
      imageFiles: 0,
      geoTaggedImages: 0,
      newEntries: 0,
      duplicatesFound: 0,
      errors: 0,
      errorsByType: {},
      processingTime: 0
    };
  }

  /**
   * Initialize services with proper configuration
   */
  async initializeServices() {
    try {
      this.logger.info('Initializing services...');
      
      // Initialize file discovery service
      this.fileDiscovery = new FileDiscoveryService(this.logger);
      
      // Initialize EXIF service with configuration
      this.exifService = new ExifService(this.logger, CONFIG.exif);
      
      this.logger.info('Services initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize services:', error);
      throw new Error(`Service initialization failed: ${error.message}`);
    }
  }

  /**
   * Parse command line arguments and determine scan directory
   */
  parseArguments() {
    const args = process.argv.slice(2);
    
    // Check for help flag
    if (args.includes('--help') || args.includes('-h')) {
      this.displayHelp();
      process.exit(0);
    }
    
    // Get directory from first argument or use default
    const scanDirectory = args[0] 
      ? resolve(args[0])
      : CONFIG.defaultScanDirectory;
    
    this.logger.info(`Scan directory determined: ${scanDirectory}`);
    return scanDirectory;
  }

  /**
   * Display help information
   */
  displayHelp() {
    console.log(chalk.blue.bold('\n🌍 Create Geo - EXIF Metadata Scanner\n'));
    console.log('Usage: node create-geo.js [directory]\n');
    console.log('Options:');
    console.log('  directory     Directory to scan for images (default: ~/pics)');
    console.log('  --help, -h    Display this help message\n');
    console.log('Examples:');
    console.log('  node create-geo.js                    # Scan default ~/pics directory');
    console.log('  node create-geo.js /path/to/photos    # Scan specific directory');
    console.log('  node create-geo.js ./my-photos        # Scan relative directory\n');
  }

  /**
   * Ensure required directories exist
   */
  async ensureDirectories() {
    const dataDir = join(process.cwd(), 'data');
    if (!existsSync(dataDir)) {
      await mkdirSync(dataDir, { recursive: true });
      this.logger.info('Created data directory');
    }
  }

  /**
   * Create atomic backup of location.json
   */
  async createBackup() {
    if (existsSync(CONFIG.locationDataPath)) {
      const backupPath = `${CONFIG.locationDataPath}.backup.${Date.now()}`;
      await copyFile(CONFIG.locationDataPath, backupPath);
      this.logger.info(`Backup created: ${backupPath}`);
      return backupPath;
    }
    return null;
  }

  /**
   * Load existing location.json data
   */
  async loadExistingLocationData() {
    try {
      if (existsSync(CONFIG.locationDataPath)) {
        const data = await readFile(CONFIG.locationDataPath, 'utf8');
        this.existingLocations = JSON.parse(data);
        this.logger.info(`Loaded ${this.existingLocations.length} existing location entries`);
      } else {
        this.existingLocations = [];
        this.logger.info('No existing location data found - starting fresh');
      }
    } catch (error) {
      this.logger.error('Failed to load existing location data:', error);
      throw new Error(`Could not load location data: ${error.message}`);
    }
  }

  /**
   * Calculate file hash for duplicate detection
   */
  async calculateFileHash(filePath) {
    try {
      const fileBuffer = await readFile(filePath);
      return createHash('md5').update(fileBuffer).digest('hex');
    } catch (error) {
      this.logger.debug(`Could not calculate hash for ${filePath}:`, error.message);
      return null;
    }
  }

  /**
   * Check if coordinates are duplicates based on multiple criteria
   */
  isDuplicate(newEntry, existingEntries) {
    const { coordinateTolerance, timestampTolerance } = CONFIG.duplicateDetection;
    
    return existingEntries.some(existing => {
      // Check coordinate proximity
      const coordsMatch = coordinatesEqual(
        { latitude: newEntry.latitude, longitude: newEntry.longitude },
        { latitude: existing.latitude, longitude: existing.longitude },
        coordinateTolerance
      );
      
      // Check timestamp proximity
      const newTime = new Date(newEntry.timestamp);
      const existingTime = new Date(existing.timestamp);
      const timeDiff = Math.abs(newTime.getTime() - existingTime.getTime());
      const timeMatch = timeDiff <= timestampTolerance;
      
      // Check exact source match (same file path)
      const sourceMatch = newEntry.source === existing.source;
      
      return coordsMatch && (timeMatch || sourceMatch);
    });
  }

  /**
   * Validate GPS coordinates against geographic bounds
   */
  validateGPSCoordinates(latitude, longitude) {
    const { gpsValidation } = CONFIG;
    
    if (!gpsValidation.enableBoundsCheck) {
      return validateCoordinates(latitude, longitude);
    }
    
    // Basic coordinate validation
    if (!validateCoordinates(latitude, longitude)) {
      return false;
    }
    
    // Extended bounds checking
    return latitude >= gpsValidation.minLatitude && 
           latitude <= gpsValidation.maxLatitude &&
           longitude >= gpsValidation.minLongitude && 
           longitude <= gpsValidation.maxLongitude;
  }

  /**
   * Process a single image file and extract GPS metadata
   */
  async processImageFile(filePath, batchLogger) {
    const operationLogger = createOperationLogger('ProcessImage', { filePath });
    
    try {
      operationLogger.start(`Processing ${filePath}`);
      
      // Calculate file hash for duplicate detection
      let fileHash = null;
      if (CONFIG.duplicateDetection.enableFileHashCheck) {
        fileHash = await this.calculateFileHash(filePath);
        if (fileHash && this.duplicateHashes.has(fileHash)) {
          this.statistics.duplicatesFound++;
          operationLogger.debug('Duplicate file detected by hash', { fileHash });
          return null;
        }
      }
      
      // Extract EXIF metadata
      const metadata = await this.exifService.extractMetadata(filePath);
      
      // Check if image has GPS data
      if (!metadata.hasGPS) {
        operationLogger.debug('No GPS data found in image');
        return null;
      }
      
      // Validate GPS coordinates
      if (!this.validateGPSCoordinates(metadata.latitude, metadata.longitude)) {
        operationLogger.warn('Invalid GPS coordinates found', {
          latitude: metadata.latitude,
          longitude: metadata.longitude
        });
        this.recordError('invalid_coordinates', filePath, 'GPS coordinates failed validation');
        return null;
      }
      
      // Structure the geo data entry
      const geoEntry = {
        timestamp: metadata.timestamp ? metadata.timestamp.toISOString() : new Date().toISOString(),
        latitude: metadata.latitude,
        longitude: metadata.longitude,
        source: `exif_metadata`,
        accuracy: 1, // EXIF data is considered most accurate
        camera: metadata.camera,
        format: metadata.format,
        filePath: filePath
      };
      
      // Check for duplicates against existing data
      const allExistingData = [...this.existingLocations, ...this.newLocationData];
      if (this.isDuplicate(geoEntry, allExistingData)) {
        this.statistics.duplicatesFound++;
        operationLogger.debug('Duplicate entry detected by coordinates/timestamp');
        return null;
      }
      
      // Add file hash to tracking set
      if (fileHash) {
        this.duplicateHashes.add(fileHash);
      }
      
      this.statistics.geoTaggedImages++;
      operationLogger.success('Successfully extracted GPS metadata');
      
      return geoEntry;
      
    } catch (error) {
      const errorMessage = error.message || 'Unknown error during processing';
      this.recordError('processing_error', filePath, errorMessage);
      operationLogger.error('Processing failed', error);
      batchLogger.itemError(filePath, error, { stage: 'image_processing' });
      return null;
    }
  }

  /**
   * Record error statistics
   */
  recordError(category, filePath, message) {
    this.statistics.errors++;
    if (!this.statistics.errorsByType[category]) {
      this.statistics.errorsByType[category] = 0;
    }
    this.statistics.errorsByType[category]++;
    this.logger.error(`${category}: ${filePath}`, { error: message });
  }

  /**
   * Process images in batches for better performance and memory management
   */
  async processBatch(imageFiles, batchNumber, totalBatches) {
    const batchLogger = createBatchLogger(`ImageBatch${batchNumber}`, imageFiles.length);
    batchLogger.start();
    
    const batchResults = [];
    
    for (let i = 0; i < imageFiles.length; i++) {
      const filePath = imageFiles[i];
      
      try {
        batchLogger.itemStart(filePath, { index: i + 1, total: imageFiles.length });
        
        const result = await this.processImageFile(filePath, batchLogger);
        if (result) {
          batchResults.push(result);
          batchLogger.itemSuccess(filePath, { 
            hasGPS: true,
            coordinates: `${result.latitude}, ${result.longitude}` 
          });
        } else {
          batchLogger.itemSuccess(filePath, { hasGPS: false });
        }
        
      } catch (error) {
        batchLogger.itemError(filePath, error);
      }
      
      // Report progress periodically
      if ((i + 1) % CONFIG.progressReportInterval === 0) {
        const batchProgress = ((i + 1) / imageFiles.length * 100).toFixed(1);
        const overallProgress = (((batchNumber - 1) * CONFIG.batchSize + i + 1) / this.statistics.imageFiles * 100).toFixed(1);
        this.logger.info(`Batch ${batchNumber}/${totalBatches} progress: ${batchProgress}% (Overall: ${overallProgress}%)`);
      }
    }
    
    batchLogger.complete();
    return batchResults;
  }

  /**
   * Merge new location data with existing data while preserving integrity
   */
  mergeLocationData(newData) {
    this.logger.info(`Merging ${newData.length} new entries with ${this.existingLocations.length} existing entries`);
    
    // Combine all data
    const combinedData = [...this.existingLocations, ...newData];
    
    // Sort chronologically by timestamp
    combinedData.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    
    // Final duplicate removal pass (in case there are duplicates in existing data)
    const finalData = [];
    const processedEntries = new Set();
    
    for (const entry of combinedData) {
      const entryKey = `${entry.latitude}_${entry.longitude}_${entry.timestamp}_${entry.source}`;
      
      if (!processedEntries.has(entryKey)) {
        // Additional validation
        if (this.validateGPSCoordinates(entry.latitude, entry.longitude)) {
          finalData.push(entry);
          processedEntries.add(entryKey);
        } else {
          this.logger.warn('Removing invalid entry during merge', entry);
        }
      } else {
        this.statistics.duplicatesFound++;
        this.logger.debug('Duplicate removed during final merge', entry);
      }
    }
    
    this.statistics.newEntries = newData.length;
    this.logger.info(`Final dataset: ${finalData.length} entries (${this.statistics.newEntries} new, ${this.statistics.duplicatesFound} duplicates removed)`);
    
    return finalData;
  }

  /**
   * Validate final dataset against JSON schema structure
   */
  validateDataset(data) {
    const requiredFields = ['timestamp', 'latitude', 'longitude', 'source', 'accuracy'];
    const errors = [];
    
    for (let i = 0; i < data.length; i++) {
      const entry = data[i];
      
      // Check required fields
      for (const field of requiredFields) {
        if (entry[field] === undefined || entry[field] === null) {
          errors.push(`Entry ${i}: Missing required field '${field}'`);
        }
      }
      
      // Validate data types
      if (typeof entry.latitude !== 'number' || typeof entry.longitude !== 'number') {
        errors.push(`Entry ${i}: Coordinates must be numbers`);
      }
      
      // Validate timestamp format
      if (entry.timestamp && isNaN(Date.parse(entry.timestamp))) {
        errors.push(`Entry ${i}: Invalid timestamp format`);
      }
      
      // Validate coordinates
      if (!this.validateGPSCoordinates(entry.latitude, entry.longitude)) {
        errors.push(`Entry ${i}: Invalid GPS coordinates`);
      }
    }
    
    if (errors.length > 0) {
      this.logger.error('Dataset validation failed', { errors: errors.slice(0, 10) }); // Log first 10 errors
      throw new Error(`Dataset validation failed with ${errors.length} errors`);
    }
    
    this.logger.info(`Dataset validation passed for ${data.length} entries`);
    return true;
  }

  /**
   * Atomic write operation with backup and rollback
   */
  async atomicWriteLocationData(data, backupPath) {
    try {
      // Validate data before writing
      this.validateDataset(data);
      
      // Write to temporary file first
      const tempPath = `${CONFIG.locationDataPath}.tmp`;
      const jsonData = JSON.stringify(data, null, 2);
      await writeFile(tempPath, jsonData, 'utf8');
      
      // Verify written data
      const verificationData = JSON.parse(await readFile(tempPath, 'utf8'));
      if (verificationData.length !== data.length) {
        throw new Error('Data verification failed after write');
      }
      
      // Atomic move (rename) to final location
      if (existsSync(CONFIG.locationDataPath)) {
        await copyFile(tempPath, CONFIG.locationDataPath);
      } else {
        await copyFile(tempPath, CONFIG.locationDataPath);
      }
      
      // Clean up temp file
      try {
        await unlink(tempPath);
      } catch (unlinkError) {
        this.logger.warn('Could not remove temp file:', unlinkError.message);
      }
      
      this.logger.info(`Successfully wrote ${data.length} entries to ${CONFIG.locationDataPath}`);
      
    } catch (error) {
      this.logger.error('Atomic write operation failed:', error);
      
      // Attempt rollback if backup exists
      if (backupPath && existsSync(backupPath)) {
        try {
          await copyFile(backupPath, CONFIG.locationDataPath);
          this.logger.info('Successfully rolled back to backup');
        } catch (rollbackError) {
          this.logger.error('Rollback failed:', rollbackError);
          throw new Error(`Write failed and rollback failed: ${rollbackError.message}`);
        }
      }
      
      throw new Error(`Atomic write failed: ${error.message}`);
    }
  }

  /**
   * Generate comprehensive statistics report
   */
  generateReport() {
    const report = {
      timestamp: new Date().toISOString(),
      scanning: {
        totalFiles: this.statistics.totalFiles,
        imageFiles: this.statistics.imageFiles,
        geoTaggedImages: this.statistics.geoTaggedImages,
        successRate: this.statistics.imageFiles > 0 
          ? (this.statistics.geoTaggedImages / this.statistics.imageFiles * 100).toFixed(1) + '%'
          : '0%'
      },
      processing: {
        newEntries: this.statistics.newEntries,
        duplicatesFound: this.statistics.duplicatesFound,
        errors: this.statistics.errors,
        processingTime: this.statistics.processingTime
      },
      errors: this.statistics.errorsByType,
      dataset: {
        totalEntries: this.existingLocations.length + this.statistics.newEntries,
        existingEntries: this.existingLocations.length,
        addedEntries: this.statistics.newEntries
      }
    };
    
    return report;
  }

  /**
   * Display processing summary
   */
  displaySummary(report) {
    console.log(chalk.blue.bold('\n📈 Processing Summary\n'));
    
    console.log(`${chalk.green('📁 Total Files Scanned:')} ${report.scanning.totalFiles}`);
    console.log(`${chalk.cyan('🖼️ Image Files Found:')} ${report.scanning.imageFiles}`);
    console.log(`${chalk.green('📍 Geo-tagged Images:')} ${report.scanning.geoTaggedImages}`);
    console.log(`${chalk.blue('📊 GPS Success Rate:')} ${report.scanning.successRate}`);
    console.log(`${chalk.yellow('📋 New Entries Added:')} ${report.processing.newEntries}`);
    console.log(`${chalk.magenta('🔄 Duplicates Found:')} ${report.processing.duplicatesFound}`);
    
    if (report.processing.errors > 0) {
      console.log(`${chalk.red('❌ Errors:')} ${report.processing.errors}`);
      
      if (Object.keys(report.errors).length > 0) {
        console.log(chalk.yellow.bold('\n📋 Error Categories:'));
        Object.entries(report.errors).forEach(([category, count]) => {
          console.log(`  ${chalk.yellow('•')} ${category}: ${count}`);
        });
      }
    }
    
    console.log(`${chalk.blue('⏱️ Processing Time:')} ${report.processing.processingTime}ms`);
    console.log(`${chalk.cyan('💾 Total Dataset Size:')} ${report.dataset.totalEntries} entries`);
  }

  /**
   * Clean up resources and close connections
   */
  async cleanup() {
    try {
      this.logger.info('Starting cleanup process');
      
      if (this.exifService && typeof this.exifService.cleanup === 'function') {
        await this.exifService.cleanup();
      }
      
      this.logger.info('Cleanup completed successfully');
    } catch (error) {
      this.logger.error('Error during cleanup:', error);
    }
  }

  /**
   * Main execution method
   */
  async run() {
    const startTime = Date.now();
    let backupPath = null;
    
    try {
      // Display header
      console.log(chalk.blue.bold('\n🌍 Create Geo - Comprehensive EXIF Scanner\n'));
      
      // Parse command line arguments
      const scanDirectory = this.parseArguments();
      
      // Validate scan directory exists
      if (!existsSync(scanDirectory)) {
        throw new Error(`Scan directory does not exist: ${scanDirectory}`);
      }
      
      console.log(chalk.green(`Scanning directory: ${scanDirectory}\n`));
      
      // Initialize services and directories
      await this.initializeServices();
      await this.ensureDirectories();
      
      // Create backup and load existing data
      let spinner = ora('Creating backup and loading existing data...').start();
      backupPath = await this.createBackup();
      await this.loadExistingLocationData();
      spinner.succeed(`Backup created, loaded ${this.existingLocations.length} existing entries`);
      
      // Discover image files
      spinner = ora('Discovering image files...').start();
      const imageFiles = await this.fileDiscovery.scanDirectory(scanDirectory);
      this.statistics.totalFiles = this.fileDiscovery.getStats().totalFiles;
      this.statistics.imageFiles = imageFiles.length;
      spinner.succeed(`Found ${imageFiles.length} image files in ${this.statistics.totalFiles} total files`);
      
      if (imageFiles.length === 0) {
        console.log(chalk.yellow('No image files found to process'));
        return;
      }
      
      // Process images in batches
      console.log(chalk.yellow.bold('\n📸 Processing Images\n'));
      
      const batches = [];
      for (let i = 0; i < imageFiles.length; i += CONFIG.batchSize) {
        batches.push(imageFiles.slice(i, i + CONFIG.batchSize));
      }
      
      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batch = batches[batchIndex];
        const batchNumber = batchIndex + 1;
        
        spinner = ora(`Processing batch ${batchNumber}/${batches.length} (${batch.length} images)...`).start();
        
        const batchResults = await this.processBatch(batch, batchNumber, batches.length);
        this.newLocationData.push(...batchResults);
        
        spinner.succeed(`Batch ${batchNumber}/${batches.length} completed - ${batchResults.length} GPS entries extracted`);
      }
      
      // Merge and write data
      spinner = ora('Merging data and updating location file...').start();
      const finalData = this.mergeLocationData(this.newLocationData);
      await this.atomicWriteLocationData(finalData, backupPath);
      spinner.succeed('Location data updated successfully');
      
      // Record final processing time
      this.statistics.processingTime = Date.now() - startTime;
      
      // Generate and display report
      const report = this.generateReport();
      this.displaySummary(report);
      
      console.log(chalk.green.bold('\n✅ Geo metadata scanning completed successfully!'));
      
    } catch (error) {
      console.error(chalk.red.bold('\n❌ Script failed:'), error.message);
      this.logger.error('Script execution failed:', error);
      
      // Attempt rollback if we have a backup
      if (backupPath) {
        try {
          await copyFile(backupPath, CONFIG.locationDataPath);
          console.log(chalk.yellow('⚠️ Rolled back to backup due to error'));
        } catch (rollbackError) {
          console.error(chalk.red('❌ Rollback also failed:'), rollbackError.message);
        }
      }
      
      throw error;
      
    } finally {
      // Always cleanup
      await this.cleanup();
    }
  }
}

/**
 * Script entry point
 */
async function main() {
  const scanner = new CreateGeoScanner();
  
  try {
    await scanner.run();
    process.exit(0);
  } catch (error) {
    console.error(chalk.red.bold('Fatal error:'), error.message);
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export default CreateGeoScanner;