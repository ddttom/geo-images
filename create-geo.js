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
import { dirname } from 'path';
import { existsSync } from 'fs';
import ora from 'ora';

// Import existing services
import FileDiscoveryService from './src/services/fileDiscovery.js';
import ExifService from './src/services/exif.js';

// Import new utility modules
import { createConfig, validateConfig, getConfigSummary } from './src/utils/config.js';
import { createBackup, ensureDirectory, atomicWriteJSON, calculateFileHash } from './src/utils/fileOperations.js';
import { validateGPSCoordinates, isDuplicate, validateDataset } from './src/utils/validation.js';
import { StatisticsTracker, generateReport, displaySummary } from './src/utils/statistics.js';
import { parseArguments, displayHelp, handleHelpFlag, validateArguments, displayBanner, displayCompletion, displayError } from './src/utils/cli.js';
import { mergeLocationData, transformGPSEntry, processBatches } from './src/utils/dataProcessing.js';
import { createLogger, createBatchLogger, createOperationLogger } from './src/utils/debugLogger.js';
import { readFile } from 'fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Main class for comprehensive geo metadata scanning
 */
class CreateGeoScanner {
  constructor(customConfig = {}) {
    this.config = createConfig(customConfig);
    this.logger = createLogger('CreateGeo');
    this.fileDiscovery = null;
    this.exifService = null;
    this.statistics = new StatisticsTracker();
    this.processedImages = new Map(); // Cache for processed images
    this.duplicateHashes = new Set(); // Track file hashes for duplicate detection
    this.existingLocations = [];     // Existing location.json data
    this.newLocationData = [];       // Newly extracted location data
  }

  /**
   * Initialize services with proper configuration
   */
  async initializeServices() {
    try {
      this.logger.info('Initializing services...');
      
      // Validate configuration
      const configErrors = validateConfig(this.config);
      if (configErrors.length > 0) {
        throw new Error(`Configuration validation failed: ${configErrors.join(', ')}`);
      }
      
      // Log configuration summary
      this.logger.debug('Configuration summary:', getConfigSummary(this.config));
      
      // Initialize file discovery service
      this.fileDiscovery = new FileDiscoveryService(this.logger);
      
      // Initialize EXIF service with configuration
      this.exifService = new ExifService(this.logger, this.config.exif);
      
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
    const parsed = parseArguments(process.argv.slice(2), {
      defaultScanDirectory: this.config.defaultScanDirectory,
      supportedFlags: ['--help', '-h', '--verbose', '-v', '--dry-run']
    });
    
    // Handle help flag
    if (handleHelpFlag(parsed, {
      toolName: 'create-geo.js',
      description: 'Comprehensive EXIF Metadata Scanner',
      examples: [
        { command: 'node create-geo.js --verbose ~/photos', description: 'Scan with verbose output' },
        { command: 'node create-geo.js --dry-run', description: 'Preview without making changes' }
      ]
    })) {
      process.exit(0);
    }
    
    // Validate arguments
    if (!validateArguments(parsed)) {
      process.exit(1);
    }
    
    // Set verbose logging if requested
    if (parsed.flags.verbose || parsed.flags.v) {
      process.env.LOG_LEVEL = 'debug';
    }
    
    this.logger.info(`Scan directory determined: ${parsed.scanDirectory}`);
    return parsed.scanDirectory;
  }

  /**
   * Load existing location.json data
   */
  async loadExistingLocationData() {
    try {
      if (existsSync(this.config.locationDataPath)) {
        const data = await readFile(this.config.locationDataPath, 'utf8');
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
   * Process a single image file and extract GPS metadata
   */
  async processImageFile(filePath, batchLogger) {
    const operationLogger = createOperationLogger('ProcessImage', { filePath });
    
    try {
      operationLogger.start(`Processing ${filePath}`);
      
      // Calculate file hash for duplicate detection
      let fileHash = null;
      if (this.config.duplicateDetection.enableFileHashCheck) {
        fileHash = await calculateFileHash(filePath);
        if (fileHash && this.duplicateHashes.has(fileHash)) {
          this.statistics.increment('duplicatesFound');
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
      if (!validateGPSCoordinates(metadata.latitude, metadata.longitude, this.config.gpsValidation)) {
        operationLogger.warn('Invalid GPS coordinates found', {
          latitude: metadata.latitude,
          longitude: metadata.longitude
        });
        this.statistics.recordError('invalid_coordinates', filePath, 'GPS coordinates failed validation');
        return null;
      }
      
      // Create and transform the geo data entry
      const rawEntry = {
        timestamp: metadata.timestamp ? metadata.timestamp.toISOString() : new Date().toISOString(),
        latitude: metadata.latitude,
        longitude: metadata.longitude,
        source: 'exif_metadata',
        accuracy: 1, // EXIF data is considered most accurate
        camera: metadata.camera,
        format: metadata.format,
        filePath: filePath
      };
      
      const geoEntry = transformGPSEntry(rawEntry, {
        includeMetadata: true,
        normalizeTimestamp: true,
        addDefaults: true,
        precision: 6
      });
      
      // Check for duplicates against existing data
      const allExistingData = [...this.existingLocations, ...this.newLocationData];
      if (isDuplicate(geoEntry, allExistingData, this.config.duplicateDetection)) {
        this.statistics.increment('duplicatesFound');
        operationLogger.debug('Duplicate entry detected by coordinates/timestamp');
        return null;
      }
      
      // Add file hash to tracking set
      if (fileHash) {
        this.duplicateHashes.add(fileHash);
      }
      
      this.statistics.increment('geoTaggedImages');
      operationLogger.success('Successfully extracted GPS metadata');
      
      return geoEntry;
      
    } catch (error) {
      const errorMessage = error.message || 'Unknown error during processing';
      this.statistics.recordError('processing_error', filePath, errorMessage);
      operationLogger.error('Processing failed', error);
      batchLogger.itemError(filePath, error, { stage: 'image_processing' });
      return null;
    }
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
      if ((i + 1) % this.config.progressReportInterval === 0) {
        const batchProgress = ((i + 1) / imageFiles.length * 100).toFixed(1);
        const overallProgress = (((batchNumber - 1) * this.config.batchSize + i + 1) / this.statistics.getStatistics().imageFiles * 100).toFixed(1);
        this.logger.info(`Batch ${batchNumber}/${totalBatches} progress: ${batchProgress}% (Overall: ${overallProgress}%)`);
      }
    }
    
    batchLogger.complete();
    return batchResults;
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
    this.statistics.startTiming();
    let backupPath = null;
    
    try {
      // Display banner
      displayBanner({
        title: '🌍 Create Geo - Comprehensive EXIF Scanner',
        subtitle: 'Extracting GPS metadata from image collections',
        author: 'Tom Cranstoun <ddttom@github.com>'
      });
      
      // Parse command line arguments
      const scanDirectory = this.parseArguments();
      
      // Validate scan directory exists
      if (!existsSync(scanDirectory)) {
        throw new Error(`Scan directory does not exist: ${scanDirectory}`);
      }
      
      console.log(`\nScanning directory: ${scanDirectory}\n`);
      
      // Initialize services and directories
      await this.initializeServices();
      await ensureDirectory(dirname(this.config.locationDataPath));
      
      // Create backup and load existing data
      let spinner = ora('Creating backup and loading existing data...').start();
      backupPath = await createBackup(this.config.locationDataPath);
      await this.loadExistingLocationData();
      spinner.succeed(`Backup created, loaded ${this.existingLocations.length} existing entries`);
      
      // Discover image files
      spinner = ora('Discovering image files...').start();
      const imageFiles = await this.fileDiscovery.scanDirectory(scanDirectory);
      this.statistics.set('totalFiles', this.fileDiscovery.getStats().totalFiles);
      this.statistics.set('imageFiles', imageFiles.length);
      spinner.succeed(`Found ${imageFiles.length} image files in ${this.statistics.getStatistics().totalFiles} total files`);
      
      if (imageFiles.length === 0) {
        console.log('No image files found to process');
        return;
      }
      
      // Process images using batch processing utility
      console.log('\n📸 Processing Images\n');
      
      const processingResult = await processBatches(
        imageFiles,
        async (batch, batchNumber, totalBatches) => {
          const spinner = ora(`Processing batch ${batchNumber}/${totalBatches} (${batch.length} images)...`).start();
          
          try {
            const batchResults = await this.processBatch(batch, batchNumber, totalBatches);
            spinner.succeed(`Batch ${batchNumber}/${totalBatches} completed - ${batchResults.length} GPS entries extracted`);
            return batchResults;
          } catch (error) {
            spinner.fail(`Batch ${batchNumber}/${totalBatches} failed: ${error.message}`);
            throw error;
          }
        },
        {
          batchSize: this.config.batchSize,
          continueOnError: true
        }
      );
      
      // Collect all results
      this.newLocationData = processingResult.batchResults.flat();
      
      // Merge and write data
      spinner = ora('Merging data and updating location file...').start();
      const mergeResult = mergeLocationData(
        this.existingLocations,
        this.newLocationData,
        {
          sortByTimestamp: true,
          removeDuplicates: true,
          validateCoordinates: true,
          bounds: this.config.gpsValidation,
          tolerances: this.config.duplicateDetection
        }
      );
      
      // Validate final dataset
      const validation = validateDataset(mergeResult.data, this.config.gpsValidation);
      if (!validation.isValid) {
        this.logger.warn('Dataset validation warnings:', validation.errors.slice(0, 5));
      }
      
      // Write data atomically
      await atomicWriteJSON(this.config.locationDataPath, mergeResult.data, {
        backupPath,
        indent: 2,
        validator: (parsedData, originalData) => {
          return Array.isArray(parsedData) && parsedData.length === originalData.length;
        }
      });
      
      spinner.succeed('Location data updated successfully');
      
      // Update statistics
      this.statistics.set('newEntries', mergeResult.statistics.newEntries);
      this.statistics.increment('duplicatesFound', mergeResult.statistics.duplicatesRemoved);
      this.statistics.endTiming();
      
      // Generate and display report
      const report = generateReport(this.statistics, this.existingLocations);
      displaySummary(report, {
        showErrors: true,
        showPerformance: true,
        showDataset: true
      });
      
      displayCompletion(true, {
        newEntries: this.statistics.getStatistics().newEntries,
        duplicatesFound: this.statistics.getStatistics().duplicatesFound
      });
      
    } catch (error) {
      this.statistics.endTiming();
      displayError('Script failed', error, { showStack: false });
      this.logger.error('Script execution failed:', error);
      
      // Attempt rollback if we have a backup
      if (backupPath && existsSync(backupPath)) {
        try {
          const { copyFile } = await import('fs/promises');
          await copyFile(backupPath, this.config.locationDataPath);
          console.log('⚠️ Rolled back to backup due to error');
        } catch (rollbackError) {
          displayError('Rollback also failed', rollbackError);
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
    displayError('Fatal error', error);
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export default CreateGeoScanner;