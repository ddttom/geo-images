# Geo Images User Manual

**Version:** 1.0.0  
**Last Updated:** August 29, 2025

## Table of Contents

1. [Overview](#overview)
2. [Installation](#installation)
3. [Quick Start Guide](#quick-start-guide)
4. [Getting Timeline Data](#getting-timeline-data)
5. [Configuration](#configuration)
6. [Using the Application](#using-the-application)
7. [Tools and Utilities](#tools-and-utilities)
8. [Troubleshooting](#troubleshooting)
9. [Advanced Usage](#advanced-usage)
10. [Performance Tips](#performance-tips)

## Overview

Geo Images is a Node.js application that intelligently adds GPS coordinates to photos that lack location data. It analyzes image timestamps and uses multiple fallback mechanisms to determine where each photo was taken, leveraging Google Maps timeline data and nearby geotagged images.

### What It Does

- **Adds GPS coordinates** to photos without location data
- **Uses timeline data** from Google Maps to match photo timestamps with your location history
- **Cross-references images** using nearby photos that already have GPS data
- **Smart interpolation** calculates likely locations based on temporal and spatial relationships
- **File timestamp fallback** uses file modification dates when EXIF timestamps are missing

### Key Features

- **96.5%+ success rate** for adding GPS coordinates
- **Multiple timeline formats** supported (Timeline Edits.json and Timeline.json)
- **Comprehensive error handling** with detailed reporting
- **Batch processing** for efficient handling of large photo collections
- **Diagnostic tools** for troubleshooting issues
- **Cross-platform support** (Windows, macOS, Linux)

## Installation

### Prerequisites

- **Node.js** version 16 or higher
- **npm** (comes with Node.js)

### Install Dependencies

1. Clone or download the geo-images project
2. Open a terminal in the project directory
3. Install dependencies:

```bash
npm install
```

### Verify Installation

Test that everything is working:

```bash
npm test
```

You should see all tests passing (96/96 tests).

## Quick Start Guide

### Step 1: Prepare Your Timeline Data

1. Export your Google Maps timeline data from [Google Takeout](https://takeout.google.com/)
2. Look for one of these files in your export:
   - **Timeline Edits.json** (recommended - newer format with more location data)
   - **Timeline.json** (legacy format - also supported)
3. Place the timeline file in the `data/` directory

### Step 2: Configure Photo Directory (Optional)

Create a `.env` file in the project root:

```bash
# Copy the example file
cp .env.example .env
```

Edit `.env` to set your default photo directory:

```bash
DEFAULT_PHOTO_DIR=~/pics
```

### Step 3: Run the Application

```bash
npm start
```

The application will:
1. Prompt you for the photo directory (or use the configured default)
2. Scan your photos and extract existing GPS data
3. Process photos without GPS coordinates using timeline data
4. Generate a detailed report of results

### Step 4: Review Results

Check the generated reports:
- **Console output**: Real-time progress and summary
- **data/processing-report.json**: Detailed processing report
- **data/location.json**: GPS database with all coordinates

## Getting Timeline Data

### Export from Google Takeout

1. **Access Google Takeout**
   - Go to [Google Takeout](https://takeout.google.com)
   - Sign in with your Google account

2. **Select Location Data**
   - Click "Deselect all"
   - Find and check "Location History (Timeline)" or "Maps (your places)"
   - Click "Multiple formats" or settings icon

3. **Configure Export Settings**
   - **Format**: Select JSON (not HTML)
   - **Include**: Make sure "Location History" is selected
   - **Date Range**: Choose your desired range or "All time"

4. **Export Configuration**
   - **Delivery method**: "Send download link via email"
   - **Frequency**: "Export once"
   - **File type**: ".zip"
   - **File size**: "2 GB" or larger

5. **Create Export**
   - Click "Create export"
   - Wait for email notification (can take hours to days)

### What to Look For

**Recommended files (in priority order):**
1. ✅ **Timeline Edits.json** (best - enhanced location data)
2. ✅ **Timeline.json** (good - standard format)
3. ✅ **Location History.json** (acceptable - basic location data)

**File structure should contain:**
```json
{
  "timelineObjects": [
    {
      "activitySegment": {
        "startLocation": {
          "latitudeE7": 407128000,
          "longitudeE7": -740060000
        },
        "duration": {
          "startTimestamp": "2024-01-15T12:00:00Z",
          "endTimestamp": "2024-01-15T14:00:00Z"
        }
      }
    }
  ]
}
```

### Verify Your Timeline File

Use the diagnostic tool to check your timeline file:

```bash
node tools/timeline-diagnostic.js "data/Timeline Edits.json"
```

Expected output:
```
🏗️  STRUCTURE ANALYSIS
──────────────────────────────
Valid JSON: ✅
Timeline Objects Found: ✅
Timeline Objects Count: 11,339
Detected Format: timelineEdits
```

## Configuration

### Environment Variables

Create or edit `.env` file:

```bash
# Photo Directory Configuration
DEFAULT_PHOTO_DIR=~/pics                    # Default photo directory

# Processing Configuration
TIMELINE_TOLERANCE_MINUTES=60               # Timeline matching tolerance
BATCH_SIZE=25                              # Images to process in parallel

# Feature Toggles
ENHANCED_FALLBACK_ENABLED=true             # Enable enhanced fallback
TIMELINE_AUGMENTATION_ENABLED=true         # Enable timeline augmentation

# Logging
LOG_LEVEL=info                             # Logging level (error, warn, info, debug)
```

### Photo Directory Paths

**Supported path formats:**
- **Tilde expansion**: `~/pics` (expands to home directory)
- **Absolute paths**: `/home/user/photos` or `C:\Users\User\Photos`
- **Relative paths**: `./images` or `../photos`

**Examples:**
```bash
# Home directory (default)
DEFAULT_PHOTO_DIR=~/pics

# Absolute path (Linux/Mac)
DEFAULT_PHOTO_DIR=/home/user/my-photos

# Absolute path (Windows)
DEFAULT_PHOTO_DIR=C:\Users\User\Pictures

# Relative path
DEFAULT_PHOTO_DIR=./test-images
```

## Using the Application

### Basic Usage

**Interactive mode:**
```bash
npm start
```

**Command line with specific directory:**
```bash
npm start -- /path/to/your/photos
```

**Process test images:**
```bash
npm start -- test-subset/
```

### What Happens During Processing

**Phase 1: Discovery and Analysis**
- Scans photo directory recursively
- Extracts existing GPS data and timestamps
- Builds database of photo metadata
- Augments timeline data with GPS coordinates from existing photos

**Phase 2: Geolocation Inference**
- For photos without GPS, tries multiple methods:
  1. **Timeline matching**: Finds GPS records within 60 minutes
  2. **Enhanced fallback**: Progressive search (1h → 6h → same day)
  3. **File timestamp fallback**: Uses file modification dates
- Writes GPS coordinates directly into image files
- Generates detailed reports

### Understanding the Output

**Console Progress:**
```
📸 Processing Images: 25/516 (4.8%) | ⏱️  00:00:45 | 📍 GPS Added: 23 | ❌ Failed: 2
```

**Final Summary:**
```
🎯 PROCESSING COMPLETE
──────────────────────────────
📊 Total Images: 516
✅ Successfully Processed: 498 (96.5%)
📍 GPS Coordinates Added: 498
❌ Processing Failures: 18 (3.5%)
⏱️  Total Processing Time: 1m 32s
```

**Success Categories:**
- **Database**: GPS found in existing database
- **EXIF**: GPS extracted from image metadata
- **Timeline**: GPS interpolated from timeline data
- **Enhanced Fallback**: GPS found using extended search

**Failure Categories:**
- **metadata_extraction**: EXIF data extraction failed
- **interpolation**: No suitable GPS coordinates found
- **missing_timestamp**: Image has no valid timestamp
- **processing**: General processing error
- **validation**: Data validation failed

## Tools and Utilities

### Timeline Diagnostic Tool

Analyze timeline files for issues:

```bash
# Basic analysis
node tools/timeline-diagnostic.js "data/Timeline Edits.json"

# Generate JSON report
node tools/timeline-diagnostic.js "data/Timeline Edits.json" --format json --output report.json

# Memory-safe analysis for large files
node tools/timeline-diagnostic.js "data/Timeline Edits.json" --streaming
```

**Features:**
- File structure validation
- Content quality assessment
- Memory usage estimation
- Actionable recommendations
- Multiple output formats

### Single Image Diagnostic Tool

Troubleshoot specific images:

```bash
node tools/single-image-diagnostic.js "/path/to/problematic/image.jpg"
```

**Provides:**
- Step-by-step processing analysis
- EXIF metadata extraction details
- Timeline data availability
- Coordinate interpolation results
- GPS write capability testing

### Standalone GPS Extraction Tool

Extract GPS data from image collections:

```bash
# Extract from default directory
node create-geo.js

# Extract from specific directory
node create-geo.js /path/to/photo/collection

# View help
node create-geo.js --help
```

**Features:**
- Recursive directory scanning
- Multi-format EXIF extraction
- Comprehensive data analysis
- Camera-based source attribution
- Detailed statistics reporting

## Troubleshooting

### Common Issues

#### No GPS Coordinates Found

**Symptoms:**
- High failure rates in interpolation
- "No suitable coordinates found" errors

**Solutions:**
1. **Check timeline data coverage:**
   - Ensure timeline file covers the date range of your images
   - Verify timeline data quality using diagnostic tool

2. **Adjust tolerance settings in `.env`:**
   ```bash
   TIMELINE_TOLERANCE_MINUTES=120  # Increase from 60 to 120 minutes
   ```

3. **Enable enhanced fallback:**
   ```bash
   ENHANCED_FALLBACK_ENABLED=true
   ```

#### Timestamp Extraction Issues

**Symptoms:**
- Images skipped with "no timestamp available" warnings
- Processing failures with timestamp-related errors

**Solutions:**
1. **Use diagnostic tool:**
   ```bash
   node tools/single-image-diagnostic.js "/path/to/problematic/image.jpg"
   ```

2. **Enable file timestamp fallback in `.env`:**
   ```bash
   # This is enabled by default
   ```

3. **Check camera compatibility:**
   - Some camera models may have non-standard EXIF formats
   - The application includes enhanced timestamp extraction for most cameras

#### Slow Processing or Memory Issues

**Solutions:**
1. **Reduce batch size in `.env`:**
   ```bash
   BATCH_SIZE=10  # Reduce from 25
   ```

2. **Process in smaller batches:**
   - Process subdirectories separately for large collections

3. **Monitor memory usage:**
   - Check processing reports for memory statistics

#### Timeline File Issues

**Symptoms:**
- "0 Timeline Objects Processed"
- JSON parsing errors

**Solutions:**
1. **Use timeline diagnostic:**
   ```bash
   node tools/timeline-diagnostic.js "data/Timeline Edits.json"
   ```

2. **Check file format:**
   - Ensure you have Timeline Edits.json or Timeline.json
   - Verify the file is valid JSON

3. **Re-export timeline data:**
   - Follow the [Getting Timeline Data](#getting-timeline-data) guide
   - Ensure Location History was enabled during photo dates

### Getting Help

1. **Enable debug logging:**
   ```bash
   LOG_LEVEL=debug npm start
   ```

2. **Check processing reports:**
   - `data/processing-report.json` - Detailed processing results
   - Console output - Real-time progress and errors

3. **Use diagnostic tools:**
   - Timeline diagnostic for timeline file issues
   - Single image diagnostic for specific image problems

4. **Review log files:**
   - Check `logs/` directory for detailed error logs

## Advanced Usage

### Custom Configuration

Edit configuration in `src/index.js`:

```javascript
this.config = {
    timelineTolerance: 60,      // Timeline matching tolerance (minutes)
    batchSize: 25,              // Images to process in parallel
    enhancedFallback: {
        enabled: true,          // Enable enhanced fallback
        maxToleranceHours: 24,  // Maximum fallback tolerance
        progressiveSearch: true // Use progressive search
    },
    timelineAugmentation: {
        enabled: true,          // Enable timeline augmentation
        exactTimeTolerance: 2,  // Minutes for duplicate detection
        createBackup: true      // Create timeline backup
    }
};
```

### Supported File Formats

**Standard Formats:**
- JPEG, TIFF, PNG, WebP, AVIF, HEIF, HEIC, HIF

**RAW Formats:**
- DNG, CR2, CR3 (Canon), NEF (Nikon), ARW (Sony), ORF, RW2, RAF, PEF, SRW

### Batch Processing Strategies

**For Large Collections:**
1. Process by date ranges
2. Process by camera/device
3. Use smaller batch sizes
4. Monitor memory usage

**For Mixed Formats:**
1. Process standard formats first
2. Handle RAW formats separately
3. Use format-specific settings

### Integration with Other Tools

**Export GPS Database:**
```bash
# GPS data is automatically exported to:
# data/geolocation-export.json
```

**Import/Export Timeline Data:**
```bash
# Timeline data is processed into:
# data/location.json
```

## Performance Tips

### Optimization Strategies

1. **Use Timeline Edits.json** - Provides significantly more location data than standard Timeline.json

2. **Enable Database Persistence** - Subsequent runs will be much faster:
   ```bash
   ENABLE_SQLITE_PERSISTENCE=true
   ```

3. **Optimize Batch Size** - Adjust based on your system:
   ```bash
   # For systems with more RAM
   BATCH_SIZE=50
   
   # For systems with limited RAM
   BATCH_SIZE=10
   ```

4. **Process Incrementally** - The application only processes new/changed images on subsequent runs

### Expected Performance

**Typical Performance Metrics:**
- **Processing Speed**: ~178ms per image average
- **Success Rate**: 96.5%+ interpolation success
- **Memory Usage**: <1GB for typical collections
- **Batch Processing**: 25 images per batch (optimized)

**Success Rate Expectations:**
- **96%+**: Excellent (current performance)
- **80-95%**: Good (may need timeline improvements)
- **<80%**: Needs investigation

### System Requirements

**Minimum Requirements:**
- Node.js 16+
- 2GB RAM
- 1GB free disk space

**Recommended Requirements:**
- Node.js 18+
- 4GB RAM
- 2GB free disk space
- SSD storage for better performance

---

## Support and Resources

### Documentation

- **README.md** - Project overview and basic setup
- **docs/CONFIGURATION.md** - Detailed configuration options
- **docs/TROUBLESHOOTING.md** - Common issues and solutions
- **docs/GOOGLE_TIMELINE_EXPORT_GUIDE.md** - Timeline export guide
- **tools/README.md** - Diagnostic tools documentation

### Getting Help

1. **Use diagnostic tools** for specific issues
2. **Check processing reports** for detailed analysis
3. **Enable debug logging** for troubleshooting
4. **Review documentation** for configuration options

### Project Information

- **License**: MIT License
- **Author**: Tom Cranstoun (ddttom)
- **Version**: 1.0.0
- **Node.js**: ES modules without TypeScript
- **Philosophy**: Simplicity and performance focused

---

*This user manual covers the essential aspects of using the Geo Images application. For technical details and development information, refer to the additional documentation in the `docs/` directory.*