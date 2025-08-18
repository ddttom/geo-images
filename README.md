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
