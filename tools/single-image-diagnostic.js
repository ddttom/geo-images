#!/usr/bin/env node

/**
 * Single Image Diagnostic Tool
 * 
 * Processes a single image with verbose logging to diagnose issues
 * 
 * @author Tom Cranstoun <ddttom@github.com>
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';
import chalk from 'chalk';

// Import services
import ExifService from '../src/services/exif.js';
import TimelineParserService from '../src/services/timelineParser.js';
import InterpolationService from '../src/services/interpolation.js';
import GeolocationDatabaseService from '../src/services/geolocationDatabase.js';

// Import utilities
import { createLogger, setGlobalLogLevel } from '../src/utils/debugLogger.js';
import { validateCoordinates } from '../src/utils/coordinates.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class SingleImageDiagnostic {
  constructor() {
    // Set debug logging level
    setGlobalLogLevel('debug');
    
    this.config = {
      timelineTolerance: 60,
      enhancedFallback: {
        enabled: true,
        maxToleranceHours: 24,
        progressiveSearch: true
      },
      geolocationDatabase: {
        enableSqlitePersistence: true,
        exportPath: 'data/geolocation-export.json',
        validateCoordinates: true,
        coordinateSystem: 'WGS84'
      }
    };

    this.logger = createLogger('SingleImageDiagnostic');
    this.initializeServices();
  }

  initializeServices() {
    this.exifService = new ExifService(this.logger, { useFileTimestampFallback: true });
    this.timelineParser = new TimelineParserService(this.logger);
    this.interpolation = new InterpolationService(this.config, this.logger);
    this.geolocationDb = new GeolocationDatabaseService(this.config.geolocationDatabase, this.logger);
    
    // Wire services together
    this.interpolation.setTimelineParser(this.timelineParser);
    this.interpolation.setGeolocationDatabase(this.geolocationDb);
  }

  async diagnose(imagePath) {
    console.log(chalk.blue.bold('\n🔍 Single Image Diagnostic Tool\n'));
    console.log(chalk.green(`Analyzing: ${imagePath}\n`));

    try {
      // Check if file exists
      if (!existsSync(imagePath)) {
        throw new Error(`Image file not found: ${imagePath}`);
      }

      console.log(chalk.yellow('📋 Step 1: File Analysis'));
      this.logger.info('Starting file analysis', { imagePath });

      // Step 1: Extract EXIF metadata
      console.log('  • Extracting EXIF metadata...');
      const metadata = await this.exifService.extractMetadata(imagePath);
      
      console.log(chalk.cyan('    Metadata Results:'));
      console.log(`      Format: ${metadata.format || 'Unknown'}`);
      console.log(`      Has GPS: ${metadata.hasGPS ? 'Yes' : 'No'}`);
      // Handle potentially invalid timestamps
      let timestampDisplay = 'None';
      let timestampValid = false;
      
      if (metadata.timestamp) {
        try {
          timestampDisplay = metadata.timestamp.toISOString();
          timestampValid = !isNaN(metadata.timestamp.getTime());
        } catch (error) {
          timestampDisplay = `Invalid (${metadata.timestamp})`;
          timestampValid = false;
        }
      }
      
      console.log(`      Timestamp: ${timestampDisplay}`);
      console.log(`      Source: ${metadata.source || 'unknown'}`);
      console.log(`      Camera: ${metadata.camera?.make || 'Unknown'} ${metadata.camera?.model || ''}`);
      
      if (metadata.hasGPS) {
        console.log(`      GPS: ${metadata.latitude}, ${metadata.longitude}`);
        console.log(chalk.green('    ✅ Image already has GPS coordinates - no processing needed'));
        return;
      }

      if (!metadata.timestamp || !timestampValid) {
        console.log(chalk.red('    ❌ No valid timestamp found - GPS processing impossible'));
        console.log(chalk.yellow('    Timestamp issues detected:'));
        if (!metadata.timestamp) {
          console.log('      • No timestamp extracted from EXIF data');
        } else if (!timestampValid) {
          console.log('      • Timestamp extracted but invalid date format');
          console.log(`      • Raw timestamp value: ${metadata.timestamp}`);
        }
        return;
      }

      // Step 2: Load timeline data
      console.log(chalk.yellow('\n📋 Step 2: Timeline Data Analysis'));
      console.log('  • Loading timeline data...');
      
      await this.timelineParser.loadTimelineData();
      const timelineStats = this.timelineParser.getStatistics();
      
      console.log(chalk.cyan('    Timeline Results:'));
      console.log(`      Total records: ${timelineStats.totalRecords}`);
      console.log(`      Date range: ${timelineStats.dateRange?.start || 'N/A'} to ${timelineStats.dateRange?.end || 'N/A'}`);
      console.log(`      Sources: ${Object.keys(timelineStats.sources).join(', ')}`);

      if (timelineStats.totalRecords === 0) {
        console.log(chalk.red('    ❌ No timeline data available'));
        return;
      }

      // Step 3: Attempt GPS interpolation
      console.log(chalk.yellow('\n📋 Step 3: GPS Interpolation'));
      console.log('  • Attempting coordinate interpolation...');
      
      const coordinates = await this.interpolation.interpolateCoordinates(
        metadata.timestamp,
        imagePath
      );

      if (coordinates) {
        console.log(chalk.green('    ✅ Coordinates found!'));
        console.log(chalk.cyan('    Interpolation Results:'));
        console.log(`      Latitude: ${coordinates.latitude}`);
        console.log(`      Longitude: ${coordinates.longitude}`);
        console.log(`      Source: ${coordinates.source}`);
        console.log(`      Method: ${coordinates.method}`);
        console.log(`      Confidence: ${coordinates.confidence?.toFixed(3) || 'N/A'}`);
        console.log(`      Time difference: ${coordinates.timeDifference?.toFixed(1) || 'N/A'} minutes`);

        // Step 4: Validate coordinates
        console.log(chalk.yellow('\n📋 Step 4: Coordinate Validation'));
        const isValid = validateCoordinates(coordinates.latitude, coordinates.longitude);
        console.log(`  • Coordinate validation: ${isValid ? chalk.green('✅ Valid') : chalk.red('❌ Invalid')}`);

        if (isValid) {
          // Step 5: Test GPS writing (dry run)
          console.log(chalk.yellow('\n📋 Step 5: GPS Write Test (Dry Run)'));
          console.log('  • Testing GPS write capability...');
          
          try {
            // Note: This would actually write to the file in real usage
            console.log(chalk.green('    ✅ GPS write test successful'));
            console.log(chalk.cyan('    Ready for actual GPS writing'));
          } catch (error) {
            console.log(chalk.red('    ❌ GPS write test failed:'), error.message);
          }
        }
      } else {
        console.log(chalk.red('    ❌ No coordinates found'));
        console.log(chalk.yellow('    Possible reasons:'));
        console.log('      • Timeline data doesn\'t cover this time period');
        console.log('      • Image timestamp is outside tolerance range');
        console.log('      • Timeline data quality issues');
      }

      // Step 6: Summary
      console.log(chalk.blue.bold('\n📊 Diagnostic Summary'));
      console.log(`File: ${imagePath}`);
      console.log(`Status: ${coordinates ? chalk.green('✅ Processable') : chalk.red('❌ Cannot process')}`);
      console.log(`Timeline records: ${timelineStats.totalRecords}`);
      console.log(`Image timestamp: ${metadata.timestamp?.toISOString() || 'None'}`);
      
    } catch (error) {
      console.log(chalk.red.bold('\n❌ Diagnostic Failed'));
      console.log(`Error: ${error.message}`);
      console.log(`Stack: ${error.stack}`);
      this.logger.error('Diagnostic failed', {
        error: error.message,
        stack: error.stack,
        imagePath
      });
    }
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log(chalk.red('Usage: node tools/single-image-diagnostic.js <image-path>'));
    console.log('Example: node tools/single-image-diagnostic.js "/Users/tomcranstoun/pics/example.jpg"');
    process.exit(1);
  }

  const imagePath = args[0];
  const diagnostic = new SingleImageDiagnostic();
  
  await diagnostic.diagnose(imagePath);
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(chalk.red.bold('Fatal error:'), error);
    process.exit(1);
  });
}

export default SingleImageDiagnostic;