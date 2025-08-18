# Troubleshooting Guide

## Common Issues and Solutions

### Timestamp Extraction Issues

#### Problem: Images with "Invalid Date" or missing timestamps

**Symptoms:**

- Images skipped with "no timestamp available" warnings
- Processing failures with timestamp-related errors

**Root Cause:**
EXIF timestamp parsing can fail for certain camera models or corrupted EXIF data.

**Solution:**
The application now includes enhanced timestamp extraction with:

- Robust parsing for multiple timestamp formats
- Validation of parsed dates
- Fallback to alternative timestamp fields
- Clear error messages for debugging

**Fixed in version:** Current (addresses Canon EOS R7 and other camera compatibility issues)

#### Diagnostic Steps

1. Use the single image diagnostic tool:

   ```bash
   node tools/single-image-diagnostic.js "/path/to/problematic/image.jpg"
   ```

2. Check the diagnostic output for:
   - Timestamp extraction results
   - EXIF data availability
   - Camera make/model information

### Timeline Data Issues

#### Problem: No coordinates found despite having timeline data

**Symptoms:**

- High failure rates in interpolation
- "No suitable coordinates found" errors

**Solutions:**

1. **Check timeline data coverage:**
   - Ensure Timeline Edits.json covers the date range of your images
   - Verify timeline data quality and density

2. **Adjust tolerance settings:**

   ```javascript
   // In src/index.js, modify config
   timelineTolerance: 120, // Increase from 60 to 120 minutes
   ```

3. **Enable enhanced fallback:**

   ```javascript
   enhancedFallback: {
     enabled: true,
     maxToleranceHours: 48, // Increase from 24 hours
     progressiveSearch: true
   }
   ```

### Processing Performance

#### Problem: Slow processing or memory issues

**Solutions:**

1. **Reduce batch size:**

   ```javascript
   batchSize: 10, // Reduce from 25
   ```

2. **Monitor memory usage:**
   - Check processing reports for memory statistics
   - Process images in smaller batches for large collections

### Error Logging and Debugging

#### Enhanced Error Messages

The application now provides comprehensive error logging with:

- Full error stack traces
- Processing stage information
- Image metadata context
- Timeline data statistics

#### Debug Mode

Set environment variable for detailed logging:

```bash
LOG_LEVEL=debug npm start
```

#### Single Image Diagnostics

For troubleshooting specific images:

```bash
node tools/single-image-diagnostic.js "/path/to/image.jpg"
```

This tool provides:

- Step-by-step processing analysis
- EXIF metadata extraction details
- Timeline data availability
- Coordinate interpolation results
- GPS write capability testing

### Success Rate Optimization

#### Expected Success Rates

- **96%+**: Excellent (current performance after fixes)
- **80-95%**: Good (may need timeline data improvements)
- **<80%**: Needs investigation (check timestamp extraction and timeline coverage)

#### Improving Success Rates

1. **Ensure timeline data quality:**
   - Complete Timeline Edits.json export from Google Takeout
   - Verify date range coverage matches your images

2. **Check image timestamp quality:**
   - Use diagnostic tool to identify timestamp issues
   - Consider batch processing by camera/date ranges

3. **Optimize configuration:**
   - Adjust tolerance settings based on your use case
   - Enable all fallback strategies

### File Format Support

#### Supported Formats

- **JPEG/JPG**: Full support with piexifjs
- **TIFF**: Full support with piexifjs  
- **RAW formats**: CR3, CR2, NEF, ARW, ORF, RW2, RAF, PEF, SRW, DNG via exiftool
- **Modern formats**: PNG, WebP, AVIF, HEIF, HEIC via Sharp (with exiftool fallback)

#### Format-Specific Issues

- **RAW files**: Require exiftool installation
- **HEIC files**: May need additional system codecs
- **Corrupted files**: Will be skipped with clear error messages

### Getting Help

1. **Check processing reports:** `data/processing-report.json`
2. **Review log files:** `logs/` directory
3. **Use diagnostic tool:** For individual image analysis
4. **Enable debug logging:** For detailed troubleshooting

### Recent Fixes (Current Version)

- ✅ **Fixed timestamp extraction bug** causing 100% failure rates
- ✅ **Enhanced error logging** with full context and stack traces
- ✅ **Added diagnostic tool** for single image troubleshooting
- ✅ **Improved Canon EOS R7 compatibility** and other camera models
- ✅ **Better validation** of parsed timestamps and coordinates
