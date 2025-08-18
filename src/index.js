#!/usr/bin/env node

/**
 * Geo Images - Main Orchestrator
 * 
 * A comprehensive Node.js application that intelligently adds GPS coordinates 
 * to photos that lack location data using Google Maps timeline data and 
 * nearby geotagged images.
 * 
 * @author Tom Cranstoun <ddttom@github.com>
 * @version 1.0.0
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import chalk from 'chalk';
import ora from 'ora';

// Import services
import FileDiscoveryService from './services/fileDiscovery.js';
import ExifService from './services/exif.js';
import TimelineParserService from './services/timelineParser.js';
import InterpolationService from './services/interpolation.js';
import GeolocationDatabaseService from './services/geolocationDatabase.js';
import TimelineAugmentationService from './services/timelineAugmentation.js';
import StatisticsService from './services/statistics.js';

// Import utilities
import { getUserInput } from './utils/input.js';
import { createLogger } from './utils/debugLogger.js';
import { validateCoordinates } from './utils/coordinates.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Main application class that orchestrates the geo-tagging process
 */
class GeoImagesApp {
  constructor() {
    this.config = {
      timelineTolerance: 60,      // Timeline matching tolerance (minutes)
      batchSize: 25,              // Images to process in parallel
      enhancedFallback: {
        enabled: true,            // Enable enhanced fallback interpolation
        maxToleranceHours: 24,    // Maximum fallback tolerance
        progressiveSearch: true   // Use progressive search expansion
      },
      timelineAugmentation: {
        enabled: true,            // Enable timeline augmentation
        exactTimeTolerance: 2,    // Minutes for exact duplicate detection
        createBackup: true        // Create timeline backup
      },
      geolocationDatabase: {
        enableSqlitePersistence: true,    // Enable SQLite persistence
        exportPath: 'data/geolocation-export.json',  // JSON export path
        validateCoordinates: true,         // Validate GPS coordinates
        coordinateSystem: 'WGS84'          // Coordinate system standard
      },
      exif: {
        useFileTimestampFallback: true    // Use file modification time as fallback for missing EXIF timestamps
      }
    };

    this.logger = createLogger('GeoImagesApp');
    this.statistics = new StatisticsService();
    
    // Initialize services
    this.initializeServices();
    
    // Ensure data directory exists
    this.ensureDataDirectory();
  }

  /**
   * Initialize all service instances
   */
  initializeServices() {
    this.fileDiscovery = new FileDiscoveryService(this.logger);
    this.exifService = new ExifService(this.logger, this.config.exif);
    this.timelineParser = new TimelineParserService(this.logger);
    this.interpolation = new InterpolationService(this.config, this.logger);
    this.geolocationDb = new GeolocationDatabaseService(this.config.geolocationDatabase, this.logger);
    this.timelineAugmentation = new TimelineAugmentationService(this.config.timelineAugmentation, this.logger);
    
    // Wire services together
    this.interpolation.setTimelineParser(this.timelineParser);
    this.interpolation.setGeolocationDatabase(this.geolocationDb);
  }

  /**
   * Ensure data directory exists
   */
  ensureDataDirectory() {
    const dataDir = join(process.cwd(), 'data');
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true });
      this.logger.info('Created data directory');
    }
  }

  /**
   * Main application entry point
   */
  async run() {
    try {
      console.log(chalk.blue.bold('\n🌍 Geo Images - GPS Coordinate Processor\n'));
      
      // Get photo directory from command line or user input
      const photoDirectory = await this.getPhotoDirectory();
      
      console.log(chalk.green(`Processing photos in: ${photoDirectory}\n`));
      
      // Phase 1: Discovery and Analysis
      await this.discoveryPhase(photoDirectory);
      
      // Phase 2: Geolocation Inference
      await this.geolocationPhase();
      
      // Generate final reports
      await this.generateReports();
      
      console.log(chalk.green.bold('\n✅ Processing completed successfully!'));
      
      // Clean up services and exit
      await this.cleanup();
      process.exit(0);
      
    } catch (error) {
      this.logger.error('Application error:', error);
      console.error(chalk.red.bold('\n❌ Application failed:'), error.message);
      await this.cleanup();
      process.exit(1);
    }
  }

  /**
   * Get photo directory from command line args or user input
   */
  async getPhotoDirectory() {
    const args = process.argv.slice(2);
    
    if (args.length > 0) {
      return args[0];
    }
    
    const defaultPath = join(process.env.HOME || process.env.USERPROFILE || '', 'pics');
    return await getUserInput('Enter photo directory path:', defaultPath);
  }

  /**
   * Phase 1: Discovery and Analysis
   */
  async discoveryPhase(photoDirectory) {
    console.log(chalk.yellow.bold('📁 Phase 1: Discovery and Analysis\n'));
    
    const spinner = ora('Scanning photo directory...').start();
    
    try {
      // Discover all image files
      const imageFiles = await this.fileDiscovery.scanDirectory(photoDirectory);
      spinner.succeed(`Found ${imageFiles.length} image files`);
      
      this.statistics.setTotalImages(imageFiles.length);
      
      // Load existing timeline data
      spinner.start('Loading timeline data...');
      await this.timelineParser.loadTimelineData();
      spinner.succeed('Timeline data loaded');
      
      // Extract metadata from images
      spinner.start('Extracting image metadata...');
      const imageMetadata = await this.extractImageMetadata(imageFiles);
      spinner.succeed(`Extracted metadata from ${imageMetadata.length} images`);
      
      // Augment timeline with GPS data from images
      if (this.config.timelineAugmentation.enabled) {
        spinner.start('Augmenting timeline data...');
        await this.timelineAugmentation.augmentTimeline(imageMetadata, this.timelineParser);
        spinner.succeed('Timeline augmentation completed');
      }
      
      this.imageMetadata = imageMetadata;
      
    } catch (error) {
      spinner.fail('Discovery phase failed');
      throw error;
    }
  }

  /**
   * Phase 2: Geolocation Inference
   */
  async geolocationPhase() {
    console.log(chalk.yellow.bold('\n🎯 Phase 2: Geolocation Inference\n'));
    
    const imagesWithoutGPS = this.imageMetadata.filter(img => !img.hasGPS);
    
    if (imagesWithoutGPS.length === 0) {
      console.log(chalk.green('All images already have GPS coordinates!'));
      return;
    }
    
    console.log(`Processing ${imagesWithoutGPS.length} images without GPS coordinates...\n`);
    
    // Process images in batches
    const batches = this.createBatches(imagesWithoutGPS, this.config.batchSize);
    
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      const spinner = ora(`Processing batch ${i + 1}/${batches.length} (${batch.length} images)...`).start();
      
      try {
        await this.processBatch(batch);
        spinner.succeed(`Batch ${i + 1}/${batches.length} completed`);
      } catch (error) {
        spinner.fail(`Batch ${i + 1}/${batches.length} failed`);
        this.logger.error(`Batch processing error:`, error);
      }
    }
  }

  /**
   * Extract metadata from image files
   */
  async extractImageMetadata(imageFiles) {
    const metadata = [];
    
    for (const filePath of imageFiles) {
      try {
        const exifData = await this.exifService.extractMetadata(filePath);
        metadata.push({
          filePath,
          ...exifData
        });
      } catch (error) {
        this.logger.warn(`Failed to extract metadata from ${filePath}:`, error.message);
        this.statistics.recordFailure('metadata_extraction', filePath, error.message);
      }
    }
    
    return metadata;
  }

  /**
   * Create batches for processing
   */
  createBatches(items, batchSize) {
    const batches = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }

  /**
   * Process a batch of images
   */
  async processBatch(batch) {
    const promises = batch.map(async (imageData) => {
      try {
        this.logger.debug(`Starting processing for ${imageData.filePath}`, {
          filePath: imageData.filePath,
          hasTimestamp: !!imageData.timestamp,
          timestamp: imageData.timestamp?.toISOString(),
          hasGPS: imageData.hasGPS,
          format: imageData.format,
          source: imageData.source,
          stage: 'batch_processing_start'
        });

        // Check if image has a valid timestamp before attempting GPS processing
        if (!imageData.timestamp) {
          this.logger.warn(`Skipping ${imageData.filePath} - no timestamp available`, {
            filePath: imageData.filePath,
            source: imageData.source,
            stage: 'timestamp_validation_failed'
          });
          this.statistics.recordFailure('missing_timestamp', imageData.filePath, 'Image has no timestamp - GPS processing skipped');
          return;
        }
        
        // Try to get GPS coordinates through interpolation
        const coordinates = await this.interpolation.interpolateCoordinates(
          imageData.timestamp,
          imageData.filePath
        );
        
        if (coordinates) {
          this.logger.debug(`Coordinates found for ${imageData.filePath}`, {
            filePath: imageData.filePath,
            coordinates,
            stage: 'coordinates_found'
          });

          // Validate coordinates
          if (this.config.geolocationDatabase.validateCoordinates) {
            if (!validateCoordinates(coordinates.latitude, coordinates.longitude)) {
              throw new Error(`Invalid coordinates: lat=${coordinates.latitude}, lon=${coordinates.longitude}`);
            }
          }
          
          // Write GPS data to image
          this.logger.debug(`Writing GPS data to ${imageData.filePath}`, {
            filePath: imageData.filePath,
            stage: 'gps_write_start'
          });
          
          await this.exifService.writeGPSData(imageData.filePath, coordinates);
          
          // Store in database with original image timestamp
          await this.geolocationDb.storeCoordinates(
            imageData.filePath,
            coordinates,
            'interpolation',
            {}, // metadata
            imageData.timestamp // original image timestamp
          );
          
          this.logger.debug(`Successfully processed ${imageData.filePath}`, {
            filePath: imageData.filePath,
            stage: 'processing_complete'
          });
          
          this.statistics.recordSuccess('interpolation', imageData.filePath);
        } else {
          this.logger.warn(`No coordinates found for ${imageData.filePath}`, {
            filePath: imageData.filePath,
            stage: 'no_coordinates_found'
          });
          this.statistics.recordFailure('interpolation', imageData.filePath, 'No suitable coordinates found');
        }
        
      } catch (error) {
        // Enhanced error logging with full context
        const errorMessage = error.message || error.toString() || 'Unknown error';
        const errorStack = error.stack || 'No stack trace available';
        
        // Log comprehensive error details
        this.logger.error(`Failed to process ${imageData.filePath}`, {
          error: errorMessage,
          stack: errorStack,
          errorType: error.constructor.name,
          imageData: {
            filePath: imageData.filePath,
            hasTimestamp: !!imageData.timestamp,
            timestamp: imageData.timestamp?.toISOString(),
            hasGPS: imageData.hasGPS,
            format: imageData.format,
            source: imageData.source
          },
          stage: 'processing_error'
        });
        
        // Handle timestamp validation errors specifically
        if (errorMessage.includes('Missing timestamp') || errorMessage.includes('timestamp')) {
          this.statistics.recordFailure('missing_timestamp', imageData.filePath, errorMessage);
        } else if (errorMessage.includes('interpolation') || errorMessage.includes('coordinates')) {
          this.statistics.recordFailure('interpolation', imageData.filePath, errorMessage);
        } else {
          this.statistics.recordFailure('processing', imageData.filePath, errorMessage);
        }
      }
    });
    
    await Promise.allSettled(promises);
  }

  /**
   * Generate final reports
   */
  async generateReports() {
    console.log(chalk.yellow.bold('\n📊 Generating Reports\n'));
    
    const spinner = ora('Generating processing report...').start();
    
    try {
      // Generate statistics report
      const report = this.statistics.generateReport();
      
      // Export geolocation database
      await this.geolocationDb.exportDatabase();
      
      // Save processing report
      await this.statistics.saveReport('data/processing-report.json');
      
      // Display summary
      this.displaySummary(report);
      
      spinner.succeed('Reports generated successfully');
      
    } catch (error) {
      spinner.fail('Report generation failed');
      throw error;
    }
  }

  /**
   * Clean up services and close connections
   */
  async cleanup() {
    try {
      this.logger.debug('Starting cleanup process');
      
      // Close geolocation database connections
      if (this.geolocationDb && typeof this.geolocationDb.close === 'function') {
        await this.geolocationDb.close();
      }
      
      // Close any other service connections
      if (this.timelineParser && typeof this.timelineParser.close === 'function') {
        await this.timelineParser.close();
      }
      
      this.logger.debug('Cleanup completed');
    } catch (error) {
      this.logger.warn('Error during cleanup:', error.message);
    }
  }

  /**
   * Display processing summary
   */
  displaySummary(report) {
    console.log(chalk.blue.bold('\n📈 Processing Summary\n'));
    
    const imagesWithGPS = this.imageMetadata.filter(img => img.hasGPS).length;
    const imagesWithoutGPS = this.imageMetadata.filter(img => !img.hasGPS).length;
    
    console.log(`${chalk.green('✅ Total Images Found:')} ${report.totalImages}`);
    console.log(`${chalk.cyan('📍 Already Had GPS:')} ${imagesWithGPS}`);
    console.log(`${chalk.yellow('🔍 Needed Processing:')} ${imagesWithoutGPS}`);
    
    // Only show processing statistics if there were images that needed processing
    if (imagesWithoutGPS > 0) {
      console.log(`${chalk.green('✅ Successfully Processed:')} ${report.successCount}`);
      console.log(`${chalk.red('❌ Failed:')} ${report.failureCount}`);
      console.log(`${chalk.blue('📊 Success Rate:')} ${report.successRate.toFixed(1)}% (of images needing GPS)`);
      
      if (report.failuresByCategory && Object.keys(report.failuresByCategory).length > 0) {
        console.log(chalk.yellow.bold('\n📋 Failure Categories:'));
        Object.entries(report.failuresByCategory).forEach(([category, count]) => {
          console.log(`  ${chalk.yellow('•')} ${category}: ${count}`);
        });
      }
    } else {
      console.log(chalk.green.bold('\n🎉 All images already have GPS coordinates - no processing needed!'));
    }
  }
}

// Run the application if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const app = new GeoImagesApp();
  app.run().catch(error => {
    console.error(chalk.red.bold('Fatal error:'), error);
    process.exit(1);
  });
}

export default GeoImagesApp;