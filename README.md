# Geo Images - GPS Coordinate Processor

A comprehensive Node.js application that intelligently adds GPS coordinates to photos that lack location data. It analyzes image timestamps and uses multiple fallback mechanisms to determine where each photo was taken, leveraging Google Maps timeline data and nearby geotagged images.

## Features

- **Multi-format Support**: JPEG, TIFF, PNG, WebP, RAW formats (CR3, CR2, NEF, ARW, etc.)
- **Timeline Integration**: Uses Google Maps location history for accurate positioning
- **Smart Interpolation**: Multiple fallback strategies for maximum coverage
- **Batch Processing**: Efficient processing of large image collections
- **Comprehensive Reporting**: Detailed statistics and failure analysis
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
   - Place the `Timeline Edits.json` file in the `data/` directory
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
  3. **Nearby images**: Uses GPS data from temporally close photos
- Writes calculated GPS coordinates directly into image files
- Generates detailed reports of successes and failures

### GPS Priority Chain

The application uses a priority-based system for GPS sources:

1. **Image EXIF** (Priority: 100) - Existing GPS data in photos
2. **Database Cached** (Priority: 90) - Previously processed coordinates
3. **Timeline Exact** (Priority: 80) - Direct timeline matches
4. **Timeline Interpolation** (Priority: 70) - Calculated from timeline
5. **Nearby Images** (Priority: 60) - Cross-referenced from other photos
6. **Enhanced Fallback** (Priority: 50) - Extended time tolerance search

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
│   ├── timelineParser.js      # Google Maps timeline processing
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
- Spatial interpolation between known GPS points

#### EXIF Processing

- Multi-format support with piexifjs and exiftool
- Hybrid GPS writing approach for maximum compatibility
- Optimized processing for RAW formats

## Supported Formats

### Standard Formats

- JPEG, TIFF, PNG, WebP, AVIF, HEIF, HEIC

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
- **Success Rates**: 91%+ interpolation success
- **Processing Speed**: ~2-5 seconds per image (varies by format)
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

### Scripts

```bash
npm start          # Run the application
npm run dev        # Development mode with file watching
npm test           # Run tests (if any)
npm run lint       # Run ESLint
npm run lint:fix   # Fix ESLint issues
npm run format     # Format code with Prettier
```

## Troubleshooting

### Common Issues

#### No GPS coordinates found

- Verify `Timeline Edits.json` is in the `data/` directory
- Check that timeline data covers your photo date range
- Enable enhanced fallback for better coverage

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
- Check file path and permissions
- Review logs for specific error messages

### Debug Mode

Enable debug logging:

```bash
LOG_LEVEL=debug npm start
```

### Getting Help

1. Check the logs in the `logs/` directory
2. Review the processing report for failure details
3. Enable debug mode for verbose output
4. Check GitHub issues for similar problems

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
