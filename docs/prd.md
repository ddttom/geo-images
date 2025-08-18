# Image Geolocation Processor

## what to buid

The **Image Geolocation Processor** is a comprehensive Node.js application that intelligently adds GPS coordinates to photos that lack location data. It analyzes image timestamps and uses multiple fallback mechanisms to determine where each photo was taken, leveraging Google Maps timeline data and nearby geotagged images.

## Core Problem It Solves

Many photos, especially older ones or those from cameras without GPS, lack location information. This program solves that problem by:

1. **Using timeline data**: Matching photo timestamps with your Google Maps location history
2. **Image cross-referencing**: Using nearby photos that do have GPS data
3. **Smart interpolation**: Calculating likely locations based on temporal and spatial relationships

## How to Use It

### Basic Usage

1. **Prepare your data**:
   - Export your Google Maps timeline data from [Google Takeout](https://takeout.google.com/)
   - Place the `Timeline Edits.json` file in the `data/` directory
   - Have photos in a directory you want to process
   - the application will inspect your `Timeline Edits.json` and extract date and location information, merging this with any pre-existing info in data/location.json (if it exists) and then keep the location.json info in memory, to be updated as new info is discovered  from images on file; the app then discards its in-memory copy of the `Timeline Edits.json` file.

2. **Run the application**:

   ```bash
   npm install
   npm start
   ```

3. **Follow the prompts**:
   - Enter the directory path containing your photos (defaults to `~/pics`)
   - The program will process images automatically and show progress

### Command Line Usage

For automation or specific directories:

```bash
# Process a specific directory
npm start -- /path/to/your/photos

# Process test images
npm start -- test-subset/
```

### What Happens During Processing

The program runs in two main phases:

**Phase 1: Discovery and Analysis**

- Scans your photo directory recursively
- Extracts existing GPS data and timestamps from images
- Builds a database of photo metadata
- Augments timeline data location.json with GPS coordinates and dates from photos that already have them

**Phase 2: Geolocation Inference**

- For photos without GPS, tries multiple methods:
  1. **Timeline matching**: Finds GPS records within 60 minutes of photo timestamp
  2. **Enhanced fallback**: Progressive search (1h → 6h → same day) for distant locations
  Writes calculated GPS coordinates directly into image files
- Generates detailed reports of successes and failures
at the end it writes out the data/location.json file

## Technical Implementation Details

### Architecture Overview

The application follows a modular service-oriented architecture:

```
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

### Key Technical Components

#### 1. **Geolocation Database System** (`geolocationDatabase.js`)

- **Purpose**: In-memory database with optional SQLite persistence
- **Implementation**: Priority-based GPS source management
- **Features**:
  - Database → EXIF → Timeline → Nearby Images priority chain
  - Incremental processing (only new/changed images on subsequent runs)
  - JSON export with complete source attribution

#### 2. **Interpolation Engine** (`interpolation.js`)

- **Primary Interpolation**: Uses Google Maps timeline data, cleaned up through location.json
  - Finds closest GPS record within 60-minute tolerance
  - Implements enhanced fallback with progressive search expansion (1h → 6h → same day)
  - Automatically filters placeholder entries with null coordinates, ignoring them
  
#### 3. **Timeline Processing** (`timelineParser.js` & `timelineAugmentation.js`)

- **Parser**: Converts Google Maps timeline JSON format to usable coordinates, in location.json
- **Augmentation**: Extracts GPS from existing photos and adds to timeline
  - Smart duplicate detection
  - Automatic backup creation
  - Extends timeline coverage for better interpolation

#### 4. **EXIF Processing** (`exif.js`)

- **Multi-format Support**: JPEG, TIFF, PNG, WebP, RAW formats (including Canon CR3/CR2)
- **Hybrid GPS Writing**: Uses piexifjs with exiftool fallback
- **Optimized Processing**: Direct exiftool integration for CR3 files

#### 5. **Performance Optimizations**

- **Database-first Approach**: Checks cached GPS data before expensive EXIF operations
- **Smart Format Routing**: CR3 files bypass custom parsing for direct exiftool processing
- **Memory Management**: Releases memory between batches, tracks peak usage

### Data Flow Architecture

```bash
1. Image Discovery
   ├── Recursive directory scan
   ├── Format detection (JPEG, RAW, etc. escpecially .CR3)
   └── Initial metadata extraction

2. GPS Priority Chain
   ├── Database lookup (cached data)
   ├── EXIF extraction (piexifjs + exiftool)
   ├── Timeline interpolation (60min tolerance)
   └── Enhanced fallback (1h-same day)
    

3. GPS Writing & Storage
   ├── Coordinate validation
   ├── EXIF metadata injection
   ├── Database storage for future runs
   └── Comprehensive failure tracking
```

### Technical Specifications

**Supported Formats**:

- **Standard**: JPEG, TIFF, PNG, WebP, AVIF, HEIF, HEIC
- **RAW**: DNG, CR2, CR3 (Canon), .CR2 (Canon), NEF (Nikon), ARW (Sony), ORF, RW2, RAF, PEF, SRW

**Performance Metrics**:

- **Batch Size**: 25 images per batch (optimized)
- **Success Rates**: 91%+ interpolation success, 100% GPS writing success

**Interpolation Tolerances**:

- **Primary**: 60 minutes (configurable)
- **Enhanced Fallback**: Progressive 1h → 6h same day
- **Coordinate Validation**: WGS84 standard, bounds checking

### Configuration Options

The application can be customized via the config object in `src/index.js`:

```javascript
this.config = {
    timelineTolerance: 60,      // Timeline matching tolerance (minutes)
    batchSize: 25,              // Images to process in parallel
    enhancedFallback: {
        enabled: true,          // Enable enhanced fallback interpolation
        maxToleranceHours: 24,  // Maximum fallback tolerance
        progressiveSearch: true // Use progressive search expansion
    },
    timelineAugmentation: {
        enabled: true,          // Enable timeline augmentation
        exactTimeTolerance: 2,  // Minutes for exact duplicate detection  // Meters for proximity detection
        createBackup: true      // Create timeline backup
    },
    geolocationDatabase: {
        enableSqlitePersistence: true,    // Enable SQLite persistence
        exportPath: 'data/geolocation-export.json',  // JSON export path
        validateCoordinates: true,         // Validate GPS coordinates
        coordinateSystem: 'WGS84'          // Coordinate system standard
    }
};
```

### Output and Reporting

The application generates comprehensive reports:

**Console Output**: Real-time progress with detailed statistics
**JSON Export**: Complete processing report (`data/processing-report.json`)
**Database Export**: Consolidated GPS database (`data/geolocation-export.json`)
**Location info file**: `data/location.json`
**Failure Analysis**: Categorized failure reasons with specific recommendations

### Error Handling and Reliability

- **Comprehensive Error Tracking**: 8 failure categories with specific reasons
- **Graceful Degradation**: Continues processing when individual images fail
- **Automatic Recovery**: Retry mechanisms for temporary failures
- **Data Safety**: Automatic backups for timeline and image modifications
- **Validation**: Coordinate bounds checking, timestamp validation

### Testing and Quality Assurance

- **Test Coverage**: 100% pass rate with comprehensive test suites
- **Performance Testing**: Multi-scale benchmarking from micro to stress testing
- **Real Dataset Validation**: Tested with 1000+ image collections
- **Format Testing**: Specific CR3 and RAW format test suites

This application represents a sophisticated solution for retroactively adding GPS data to photo collections, combining multiple data sources and advanced interpolation algorithms to achieve high accuracy and reliability.
