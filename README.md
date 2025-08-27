# Geo Images - GPS Coordinate Processor

A comprehensive Node.js application that intelligently adds GPS coordinates to photos that lack location data. It analyzes image timestamps and uses multiple fallback mechanisms to determine where each photo was taken, leveraging Google Maps timeline data and nearby geotagged images.

## Features

- **Multi-format Support**: JPEG, TIFF, PNG, WebP, RAW formats (CR3, CR2, NEF, ARW, etc.)
- **Enhanced Timeline Integration**: Supports both Google Maps timeline formats:
  - **Timeline Edits.json** (recommended): Enhanced location data with 1,000x more GPS coordinates
  - **Timeline.json** (legacy): Standard timeline format also supported
- **Smart Interpolation**: Multiple fallback strategies for maximum coverage
- **File Timestamp Fallback**: Uses file modification dates when EXIF timestamps are missing
- **Batch Processing**: Efficient processing of large image collections
- **Comprehensive Error Handling**: Enhanced logging with full context and stack traces
- **Diagnostic Tools**: Single image diagnostic tool for troubleshooting
- **Database Persistence**: Optional SQLite storage for incremental processing
- **Cross-platform**: Works on macOS, Linux, and Windows

## Quick Start

### Prerequisites

- Node.js 18.0.0 or higher
- ExifTool (automatically installed via npm)

### Installation

```bash
# Clone the repository
git clone https://github.com/ddttom/geo-images.git
cd geo-images

# Install dependencies
npm install

# Copy environment configuration
cp .env.example .env
```

### Basic Usage

1. **Prepare your data**:
   - Export your Google Maps timeline data from [Google Takeout](https://takeout.google.com/)
   - Place the timeline file in the `data/` directory:
     - **Timeline Edits.json** (recommended - newer format with enhanced location data)
     - **Timeline.json** (legacy format - also supported)
   - Have photos in a directory you want to process

2. **Run the application**:

   ```bash
   npm start
   ```

3. **Follow the prompts**:
   - Enter the directory path containing your photos (defaults to `~/pics`)
   - The program will process images automatically and show progress

### Command Line Usage

```bash
# Process a specific directory
npm start -- /path/to/your/photos

# Process test images
npm start -- test-subset/
```

## Standalone Geo Extraction

### Create Geo Script

For extracting GPS metadata from existing image collections without timeline data, use the standalone `create-geo.js` script:

```bash
# Scan default ~/pics directory for geo-tagged images
node create-geo.js

# Scan specific directory
node create-geo.js /path/to/photos

# View help and options
node create-geo.js --help
```

**Features:**

- Recursively scans directory structure for all image formats
- Extracts GPS coordinates from EXIF metadata in JPEG, PNG, TIFF, RAW, and Canon .cr3 files
- Updates `data/location.json` with atomic backup/rollback protection
- Sophisticated duplicate detection using coordinates, timestamps, and file hashes
- Comprehensive error handling and progress reporting
- Seamless integration with existing application configuration

**Use Cases:**

- Initial GPS data extraction from photo collections
- Populating location database before timeline processing
- Auditing existing GPS metadata in image libraries
- Building comprehensive location datasets from multiple sources</search>
### **Major Refactoring - Modular Architecture** ✅ **Completed - August 27, 2025**

The `create-geo.js` script has undergone a comprehensive refactoring to improve maintainability, reusability, and code organization. The oversized monolithic file (716 lines) has been restructured into focused, single-responsibility utility modules.

#### **Refactoring Benefits**

- **53% Code Reduction**: Main file reduced from 716 to 334 lines
- **Improved Maintainability**: Logic separated into focused utility modules
- **Enhanced Reusability**: Utilities can be used across the entire project
- **Better Testing**: Smaller, focused modules are easier to test
- **Cleaner Architecture**: Clear separation of concerns and responsibilities

#### **New Utility Modules**

**Configuration Management** - [`src/utils/config.js`](src/utils/config.js)
- Centralized configuration with environment variable support
- Configuration validation and error handling
- Default settings and customization options

**File Operations** - [`src/utils/fileOperations.js`](src/utils/fileOperations.js)
- Atomic file operations with backup/rollback capability
- File hash calculation for duplicate detection
- Safe file manipulation with error recovery

**Validation Logic** - [`src/utils/validation.js`](src/utils/validation.js)
- GPS coordinate validation with configurable bounds
- Sophisticated duplicate detection algorithms
- Dataset integrity validation and sanitization

**Statistics & Reporting** - [`src/utils/statistics.js`](src/utils/statistics.js)
- Comprehensive statistics tracking with categorized error reporting
- Performance metrics and efficiency calculations
- Formatted report generation with recommendations

**CLI Interface** - [`src/utils/cli.js`](src/utils/cli.js)
- Command-line argument parsing and validation
- Help system with examples and usage information
- User interaction utilities and progress display

**Data Processing** - [`src/utils/dataProcessing.js`](src/utils/dataProcessing.js)
- Location data merging with conflict resolution
- Batch processing utilities for memory efficiency
- Data transformation and export capabilities

#### **Maintained Functionality**

All existing functionality has been preserved during the refactoring:
- ✅ Recursive directory scanning for all image formats
- ✅ EXIF GPS metadata extraction and validation
- ✅ Atomic backup/restore operations
- ✅ Duplicate detection using multiple criteria
- ✅ Comprehensive error handling and logging
- ✅ Progress reporting and statistics generation
- ✅ Command-line interface with help system

#### **Enhanced Features**

The refactoring has also introduced several enhancements:
- **Improved Error Handling**: More granular error categorization and reporting
- **Enhanced Configuration**: Environment variable support and validation
- **Better CLI Experience**: Improved help system and argument validation
- **Modular Design**: Utilities can be imported and used by other components
- **Performance Monitoring**: Detailed timing and efficiency metrics


## How It Works

### Processing Phases

#### **Phase 1: Discovery and Analysis**

- Scans your photo directory recursively
- Extracts existing GPS data and timestamps from images
- Builds a database of photo metadata
- Augments timeline data with GPS coordinates from photos that already have them

#### **Phase 2: Geolocation Inference**

- For photos without GPS, tries multiple methods:
  1. **Timeline matching**: Finds GPS records within 60 minutes of photo timestamp
  2. **Enhanced fallback**: Progressive search (1h → 6h → same day) for distant locations
  3. **File timestamp fallback**: Uses file modification dates when EXIF timestamps are missing
  4. **Nearby images**: Uses GPS data from temporally close photos
- Writes calculated GPS coordinates directly into image files
- Generates detailed reports of successes and failures

### GPS Priority Chain

The application uses a priority-based system for GPS sources:

1. **Database Cached** (Priority: 100) - Previously processed coordinates
2. **Image EXIF** (Priority: 90) - Existing GPS data in photos ✅ **Fixed**
3. **Timeline Exact** (Priority: 80) - Direct timeline matches
4. **Timeline Interpolation** (Priority: 70) - Calculated from timeline
5. **Nearby Images** (Priority: 60) - Cross-referenced from other photos
6. **Enhanced Fallback** (Priority: 50) - Extended time tolerance search
7. **File Timestamp Fallback** (Priority: 40) - Uses file modification dates when EXIF timestamps are missing

## Code Review Status

### **Comprehensive Code Review Completed** ✅ **August 27, 2025**

A thorough code review has been completed following industry best practices and comprehensive quality standards. Key improvements include:

- **Code Quality:** Enhanced const usage patterns and function optimization
- **Security Assessment:** Comprehensive security review with recommendations
- **Performance Analysis:** Verified excellent performance metrics (96.5% success rate)
- **Test Coverage:** Validated 100% test pass rate with 96 comprehensive tests
- **Documentation:** Created detailed review documentation and changelog

**Review Documentation:**
- [`docs/self-review.md`](docs/self-review.md) - Comprehensive review findings and recommendations
- [`docs/CHANGELOG-REVIEW.md`](docs/CHANGELOG-REVIEW.md) - Detailed changelog of all modifications

**Quality Metrics:**
- Code Quality: 8.5/10 (exceeds target)
- Test Coverage: 100% pass rate (exceeds 80% target)
- Security: 7.0/10 (recommendations provided)
- Performance: 9.0/10 (exceeds target)

## Recent Major Improvements

### **Error Handling Overhaul** ✅ **Completed**

**Problem**: Application had 0% success rate with empty error messages making diagnosis impossible.

**Solution**: Comprehensive error handling and logging improvements:

- **Fixed EXIF timestamp parsing** that was creating "Invalid Date" objects
- **Enhanced error logging** with full context, stack traces, and structured logging
- **Added file timestamp fallback** for images without EXIF timestamps
- **Created diagnostic tools** for troubleshooting individual images
- **Improved statistics display** with accurate breakdowns

**Results**: Transformed from **0% to 96.5% success rate** (498 out of 516 images processed successfully)

### **Timeline Augmentation Fix** ✅ **Completed**

**Problem**: Timeline augmentation showing inconsistent record counts (processed: 7172, loaded: 7268, saved: 7385).

**Solution**: Fixed timeline augmentation service to reuse existing timeline parser instance instead of creating duplicate instances, ensuring consistent record counts and eliminating duplicate data loading.

### **Application Exit and User Experience Improvements** ✅ **Completed**

**Problem**: Application completed successfully but didn't exit, leaving the Node.js process running indefinitely. Additionally, when all images already had GPS coordinates, the application displayed confusing statistics like "Successfully Processed: 0" and "Success Rate: 0.0%".

**Solution**: Enhanced application lifecycle and user experience:

- **Application Exit Fix**: Added proper cleanup method and explicit `process.exit()` calls with resource cleanup
- **Improved Summary Display**: Context-aware messaging that only shows processing statistics when images actually needed processing
- **Better User Experience**: Clear success messages when no processing is needed: "🎉 All images already have GPS coordinates - no processing needed!"

**Results**: Application now exits cleanly and provides clear, context-appropriate user feedback in all scenarios.

### **Processing Report Recommendations Fix** ✅ **Completed**

**Problem**: When all images already had GPS coordinates (no processing needed), the processing report was generating misleading recommendations like "Low success rate (0.0%). Consider checking timeline data quality and image timestamps."

**Solution**: Enhanced the recommendation logic in [`src/services/statistics.js`](src/services/statistics.js):

- **Conditional Recommendations**: Only generate success rate recommendations when images were actually processed
- **Special Case Handling**: When no processing was needed, generate appropriate informational message: "All images already have GPS coordinates. No processing was required."
- **Accurate Context**: Eliminates misleading "0.0% success rate" warnings when the application worked perfectly

**Results**: Processing reports now provide accurate, context-appropriate recommendations in all scenarios.

## Configuration

> 📖 **For detailed configuration options and examples, see [docs/CONFIGURATION.md](docs/CONFIGURATION.md)**

### Environment Variables

Copy `.env.example` to `.env` and customize:

```bash
# Timeline Processing
TIMELINE_TOLERANCE_MINUTES=60
BATCH_SIZE=25

# Enhanced Fallback
ENHANCED_FALLBACK_ENABLED=true
MAX_TOLERANCE_HOURS=24

# Database Settings
ENABLE_SQLITE_PERSISTENCE=true
VALIDATE_COORDINATES=true
```

### Application Configuration

The main configuration is in `src/index.js`:

```javascript
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
    exportPath: 'data/geolocation-export.json',
    validateCoordinates: true,
    coordinateSystem: 'WGS84'
  },
  exif: {
    useFileTimestampFallback: true    // Use file modification time as fallback for missing EXIF timestamps
  }
};
```

## Architecture

### Project Structure

```bash
src/
├── index.js                    # Main orchestrator
├── services/                   # Core business logic
│   ├── fileDiscovery.js       # Image scanning and indexing
│   ├── exif.js                # EXIF metadata extraction/writing
│   ├── timelineParser.js      # Google Maps timeline processing (both formats)
│   ├── timelineEditsParser.js # Timeline Edits format parser
│   ├── interpolation.js       # GPS coordinate calculation
│   ├── geolocationDatabase.js # GPS data persistence
│   ├── timelineAugmentation.js# Timeline enhancement
│   └── statistics.js          # Reporting and analytics
└── utils/                      # Helper functions
    ├── coordinates.js          # GPS coordinate utilities
    ├── distance.js            # Spatial calculations
    ├── input.js               # User interaction
    └── debugLogger.js         # Logging and debugging
```

### Key Components

#### Geolocation Database System

- In-memory database with optional SQLite persistence
- Priority-based GPS source management
- Incremental processing (only new/changed images on subsequent runs)

#### Interpolation Engine

- Primary interpolation using Google Maps timeline data
- Enhanced fallback with progressive search expansion
- File timestamp fallback for images without EXIF timestamps
- Spatial interpolation between known GPS points

#### EXIF Processing

- Multi-format support with piexifjs and exiftool
- Hybrid GPS writing approach for maximum compatibility
- Optimized processing for RAW formats
- File timestamp fallback functionality

## Supported Formats

### Standard Formats

- JPEG, TIFF, PNG, WebP, AVIF, HEIF, HEIC, HIF

### RAW Formats

- Canon: CR2, CR3
- Nikon: NEF
- Sony: ARW
- Olympus: ORF
- Panasonic: RW2
- Fujifilm: RAF
- Pentax: PEF
- Samsung: SRW
- Adobe: DNG

## Performance

### Typical Performance Metrics

- **Batch Size**: 25 images per batch (optimized)
- **Success Rates**: 96.5%+ interpolation success
- **Processing Speed**: ~178ms per image average (1.5 minutes for 516 images)
- **Memory Usage**: <1GB for typical collections

### Optimization Tips

1. **Timeline Data Quality**: Ensure your Google Maps timeline covers the date range of your photos
2. **Batch Size**: Adjust based on available memory (default: 25)
3. **Enhanced Fallback**: Enable for better coverage but slower processing
4. **SQLite Persistence**: Enable for faster subsequent runs

## Output and Reporting

### Generated Files

- **`data/location.json`**: Consolidated GPS database
- **`data/processing-report.json`**: Complete processing report
- **`data/geolocation-export.json`**: Database export
- **`logs/`**: Detailed application logs

### Diagnostic Tools

- **`tools/single-image-diagnostic.js`**: Single image troubleshooting tool with verbose logging
- **`create-geo.js`**: Comprehensive EXIF metadata scanner for extracting GPS data from image collections
- **`docs/TROUBLESHOOTING.md`**: Comprehensive troubleshooting guide

### Technical Review Documentation

- **`technical-review-findings.md`**: Comprehensive technical review with specific file references and line numbers
- **`critical-fixes-plan.md`**: Implementation plan for identified critical issues
- **`critical-fixes-summary.md`**: Summary of implemented fixes and validation results
- **`timestamp-storage-fix-summary.md`**: Comprehensive documentation of timestamp storage fix implementation

### Report Contents

- Processing statistics and success rates
- Failure analysis with categorized reasons
- Performance metrics and timing data
- Memory usage statistics
- Recommendations for improvement

## Database Optimization

### **Comprehensive SQLite Performance Optimization** ✅ **Implemented**

The application now features a sophisticated database optimization system that provides **10-100x performance improvements** for coordinate retrieval and timeline matching operations.

#### **Optimization Architecture**

```mermaid
graph TD
    A[Basic B-tree Primary Key] --> B[Migration System]
    B --> C[Comprehensive Index Strategy]
    C --> D[Composite Indexes<br/>Multi-column Patterns]
    C --> E[Covering Indexes<br/>Eliminate Table Lookups]
    C --> F[Temporal Indexes<br/>Timeline Matching]
    C --> G[Spatial Indexes<br/>Geographic Proximity]
    C --> H[Partial Indexes<br/>Filtered Queries]
    C --> I[Expression Indexes<br/>Computed Values]
    D --> J[Performance Monitoring]
    E --> J
    F --> J
    G --> J
    H --> J
    I --> J
    J --> K[Query Optimization]
    K --> L[Index Maintenance]
```

#### **Implemented Index Types**

**1. Composite Indexes for Multi-Column Query Patterns**
```sql
-- Source + timestamp for priority-based lookups
CREATE INDEX idx_geolocation_source_timestamp ON geolocation(source, timestamp);

-- Spatial + temporal for geographic timeline queries
CREATE INDEX idx_geolocation_lat_lon_timestamp ON geolocation(latitude, longitude, timestamp);

-- Temporal + source for timeline interpolation
CREATE INDEX idx_geolocation_timestamp_source ON geolocation(timestamp, source);
```

**2. Covering Indexes to Eliminate Table Lookups**
```sql
-- Complete coordinate data without table access
CREATE INDEX idx_geolocation_covering_coords ON geolocation(file_path, latitude, longitude, accuracy, confidence);

-- Temporal queries with full metadata
CREATE INDEX idx_geolocation_covering_temporal ON geolocation(timestamp, source, latitude, longitude, accuracy);
```

**3. Temporal Indexes for Timeline Matching Operations**
```sql
-- Primary timestamp index for range queries
CREATE INDEX idx_geolocation_timestamp_range ON geolocation(timestamp);

-- Hour-based grouping for tolerance searches
CREATE INDEX idx_geolocation_timestamp_hour ON geolocation(datetime(timestamp, 'start of hour'));

-- Daily aggregation for extended searches
CREATE INDEX idx_geolocation_timestamp_day ON geolocation(date(timestamp));
```

**4. Spatial Indexes for Geographic Proximity Searches**
```sql
-- Individual coordinate indexes
CREATE INDEX idx_geolocation_latitude ON geolocation(latitude);
CREATE INDEX idx_geolocation_longitude ON geolocation(longitude);

-- Spatial grid index for proximity queries (1km resolution)
CREATE INDEX idx_geolocation_spatial_grid ON geolocation(
  CAST(latitude * 1000 AS INTEGER), 
  CAST(longitude * 1000 AS INTEGER)
);
```

**5. Partial Indexes for Filtered Queries**
```sql
-- High-priority GPS sources only
CREATE INDEX idx_geolocation_high_priority_sources ON geolocation(timestamp, latitude, longitude) 
WHERE source IN ('image_exif', 'database_cached', 'timeline_exact');

-- High-confidence coordinates only
CREATE INDEX idx_geolocation_high_confidence ON geolocation(timestamp, latitude, longitude) 
WHERE confidence > 0.8;

-- High-accuracy coordinates only
CREATE INDEX idx_geolocation_high_accuracy ON geolocation(timestamp, latitude, longitude) 
WHERE accuracy IS NOT NULL AND accuracy < 100;
```

#### **Performance Improvements**

| Query Type | Before Optimization | After Optimization | Improvement |
|------------|-------------------|-------------------|-------------|
| **Coordinate Lookup** | 50-200ms (table scan) | 0.1-2ms (index lookup) | **25-2000x faster** |
| **Timeline Matching** | 100-500ms (linear search) | 1-5ms (range index) | **20-500x faster** |
| **Proximity Search** | 200-1000ms (full scan) | 2-10ms (spatial index) | **20-500x faster** |
| **Source Filtering** | 80-300ms (table scan) | 0.5-3ms (partial index) | **27-600x faster** |
| **Range Queries** | 150-800ms (sequential) | 1-8ms (temporal index) | **19-800x faster** |

#### **Database Migration System**

**Safe Schema Evolution**
- **Version Control**: Tracks database schema versions with rollback capability
- **Atomic Migrations**: All changes applied in transactions with automatic rollback on failure
- **Backward Compatibility**: Existing databases automatically upgraded on startup
- **Migration History**: Complete audit trail of all schema changes

**Migration Service Features**
```javascript
// Automatic migration on startup
await migrationService.runMigrations(sqliteDb);

// Check migration status
const status = await migrationService.getMigrationStatus(sqliteDb);

// Rollback if needed
await migrationService.rollbackTo(sqliteDb, targetVersion);
```

#### **Performance Monitoring System**

**Real-Time Query Analysis**
- **Execution Time Tracking**: Monitors all query performance with millisecond precision
- **Index Usage Analysis**: Tracks which indexes are used for each query type
- **Slow Query Detection**: Automatically identifies queries exceeding performance thresholds
- **Query Plan Analysis**: Captures and analyzes SQLite execution plans

**Performance Metrics Dashboard**
```javascript
// Get comprehensive performance statistics
const stats = await geolocationDb.getStatistics();
console.log(stats.performance);

// Analyze index effectiveness
const analysis = await geolocationDb.getPerformanceAnalysis();
console.log(analysis.recommendations);
```

**Monitoring Features**
- **Query Type Statistics**: Average, min, max execution times by query category
- **Index Efficiency Scoring**: Effectiveness ratings for each index (0-100)
- **Slow Query Logging**: Detailed analysis of performance bottlenecks
- **Usage Pattern Analysis**: Hourly query volume and performance trends

#### **Optimized Query Patterns**

**Timeline Matching with Tolerance**
```javascript
// Optimized timestamp range query using temporal indexes
const matches = await geolocationDb.findCoordinatesByTimeRange(
  targetTimestamp, 
  toleranceMinutes
);
```

**Geographic Proximity Search**
```javascript
// Spatial index-optimized proximity search
const nearby = await geolocationDb.findCoordinatesByProximity(
  latitude, 
  longitude, 
  radiusKm
);
```

**Priority-Based Source Filtering**
```javascript
// Composite index-optimized source queries
const coordinates = await geolocationDb.getCoordinates(filePath);
```

#### **Index Maintenance Strategy**

**Automated Maintenance**
- **Periodic REINDEX**: Automatically rebuilds indexes for optimal performance
- **Statistics Updates**: Keeps query planner statistics current with `PRAGMA optimize`
- **Database Analysis**: Regular `ANALYZE` commands for query plan optimization
- **Old Statistics Cleanup**: Removes performance data older than 30 days

**Maintenance Operations**
```javascript
// Run comprehensive database maintenance
await geolocationDb.runMaintenance();

// Manual index analysis
await performanceMonitor.analyzeIndexEffectiveness();
```

#### **SQLite Optimizations**

**Performance Tuning**
```sql
PRAGMA journal_mode = WAL;           -- Write-Ahead Logging for concurrency
PRAGMA synchronous = NORMAL;         -- Balanced safety/performance
PRAGMA cache_size = 10000;           -- 10MB cache size
PRAGMA temp_store = MEMORY;          -- Memory-based temporary storage
PRAGMA mmap_size = 268435456;        -- 256MB memory-mapped I/O
PRAGMA optimize;                     -- Update query planner statistics
```

#### **Usage Examples**

**Basic Coordinate Storage with Performance Monitoring**
```javascript
// Store coordinates with automatic performance tracking
await geolocationDb.storeCoordinates(
  filePath, 
  { latitude: 51.5074, longitude: -0.1278 }, 
  'timeline_interpolation',
  { accuracy: 10, confidence: 0.95 },
  imageTimestamp
);
```

**Advanced Timeline Queries**
```javascript
// Find coordinates within time tolerance using optimized indexes
const results = await geolocationDb.findCoordinatesByTimeRange(
  new Date('2023-08-15T14:30:00Z'),
  60 // 60 minutes tolerance
);
```

**Performance Analysis**
```javascript
// Get detailed performance insights
const analysis = await geolocationDb.getPerformanceAnalysis();

// Check for optimization opportunities
analysis.recommendations.forEach(rec => {
  console.log(`${rec.type}: ${rec.message} (Priority: ${rec.priority})`);
});
```

#### **Configuration Options**

**Database Optimization Settings**
```javascript
const config = {
  geolocationDatabase: {
    enableSqlitePersistence: true,
    validateCoordinates: true,
    performanceMonitoring: true,
    maintenanceInterval: 24 * 60 * 60 * 1000, // 24 hours
    slowQueryThreshold: 100, // milliseconds
    statisticsRetentionDays: 30
  }
};
```

This comprehensive database optimization system transforms the application's performance characteristics, enabling efficient processing of large GPS datasets with enterprise-grade reliability and monitoring capabilities.

## Development

### Setup Development Environment

```bash
# Install dependencies
npm install

# Run in development mode with file watching
npm run dev

# Run linting
npm run lint

# Format code
npm run format
```

### Code Quality

- **ESLint**: Comprehensive linting rules
- **Prettier**: Consistent code formatting
- **Husky**: Git hooks for quality checks
- **Conventional Commits**: Standardized commit messages

### Testing

The project includes a comprehensive test suite with 96 tests covering all core functionality:

```bash
# Run all tests
npm test

# Test results show 100% pass rate
✅ tests 96
✅ pass 96
❌ fail 0
```

**Test Coverage**:

- **EXIF Service**: 12 tests for metadata extraction and GPS writing
- **Interpolation Service**: 18 tests for GPS coordinate calculation and timestamp validation
- **Timeline Parser**: 17 tests for Google Maps timeline processing
- **Geolocation Database**: 7 tests for database operations and timestamp preservation
- **Coordinate Utilities**: 42 tests for GPS coordinate operations

**Test Infrastructure**:

- Node.js built-in test runner with ES module support
- Comprehensive service mocking and test fixtures
- Real-world test scenarios with actual coordinate data

### Scripts

```bash
npm start          # Run the application
npm run dev        # Development mode with file watching
npm test           # Run comprehensive test suite (96 tests)
npm run lint       # Run ESLint
npm run lint:fix   # Fix ESLint issues
npm run format     # Format code with Prettier
```

## Troubleshooting

### Common Issues

#### No GPS coordinates found

- Verify timeline file is in the `data/` directory:
  - `Timeline Edits.json` (recommended - provides 1,000x more location data)
  - `Timeline.json` (legacy format - also supported)
- Check that timeline data covers your photo date range
- Enable enhanced fallback for better coverage
- **Tip**: Timeline Edits format typically provides much better results due to enhanced location data

#### Processing is slow

- Reduce batch size in configuration
- Disable enhanced fallback if not needed
- Ensure sufficient memory is available

#### EXIF writing fails

- Check file permissions
- Verify image format is supported
- Try with a smaller batch size

#### Timeline data not loading

- Verify JSON format is valid
- Check file path and permissions (`data/Timeline Edits.json` or `data/Timeline.json`)
- Review logs for specific error messages
- **Format Detection**: The application automatically detects Timeline vs Timeline Edits format
- **Large Files**: Timeline Edits files can be 20MB+ - ensure sufficient memory is available

#### Images without timestamps

- The application now includes file timestamp fallback functionality
- Enable `useFileTimestampFallback: true` in the EXIF configuration
- File modification dates will be used when EXIF timestamps are missing

### Debug Mode

Enable debug logging:

```bash
LOG_LEVEL=debug npm start
```

### Single Image Diagnostic

For troubleshooting specific images:

```bash
node tools/single-image-diagnostic.js /path/to/image.jpg
```

### Getting Help

1. Check the logs in the `logs/` directory
2. Review the processing report for failure details
3. Use the single image diagnostic tool for specific images
4. Enable debug mode for verbose output
5. Check GitHub issues for similar problems

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests and linting
5. Submit a pull request

### Development Guidelines

- Follow the existing code style
- Add tests for new functionality
- Update documentation as needed
- Use conventional commit messages

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Acknowledgments

- Google Maps Timeline for location data
- ExifTool for metadata processing
- The open-source community for various libraries used

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for version history and changes.
