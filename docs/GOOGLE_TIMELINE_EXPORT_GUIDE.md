# How to Get Timeline Data from Google

## Overview

This guide helps you export timeline data from Google for use with the geo-images application. The application supports both Timeline formats:

- **Timeline Edits.json** (recommended): Enhanced format with significantly more location data
- **Timeline.json** (legacy): Standard format also supported

Both formats work with the application, but Timeline Edits typically provides much better results.

## Step-by-Step Export Process

### 1. Access Google Takeout

1. Go to **[Google Takeout](https://takeout.google.com)** in your web browser
2. Sign in with your Google account (the same one used on your phone/devices)

### 2. Select Location Data

1. Click **"Deselect all"** to uncheck everything
2. Scroll down and find **"Location History (Timeline)"** or **"Maps (your places)"**
3. **Check the box** next to it
4. Click on **"Multiple formats"** or the settings icon next to it

### 3. Configure Export Settings

**Important Settings:**
- **Format**: Select **JSON** (not HTML)
- **Include**: Make sure **"Location History"** is selected
- **Date Range**: Choose your desired date range (or "All time" for complete data)

### 4. Additional Location Data (Recommended)

Also consider selecting:
- **"Maps (your places)"** - Contains saved places and reviews
- **"My Activity"** - May contain additional location context

### 5. Export Configuration

1. Click **"Next step"** at the bottom
2. Choose export settings:
   - **Delivery method**: "Send download link via email" (recommended)
   - **Frequency**: "Export once"
   - **File type**: ".zip"
   - **File size**: "2 GB" (or larger if you have lots of data)

### 6. Create Export

1. Click **"Create export"**
2. Google will process your request (this can take several hours to days for large datasets)
3. You'll receive an email when the export is ready

## What to Look For in the Export

### Correct File Names

Look for files with these names in your downloaded archive:

#### Primary Timeline Files:
- **`Timeline Edits.json`** - Enhanced timeline format (recommended - provides 1,000x more location data)
- **`Location History.json`** - Main location history data
- **`Timeline.json`** - Standard timeline data with activities and places
- **`Semantic Location History/`** folder containing:
  - `2024_JANUARY.json`, `2024_FEBRUARY.json`, etc.
  - These contain monthly timeline data

#### File Structure You Want:
```json
{
  "timelineObjects": [
    {
      "activitySegment": {
        "startLocation": {
          "latitudeE7": 407128000,
          "longitudeE7": -740060000
        },
        "endLocation": { ... },
        "duration": {
          "startTimestamp": "2024-01-15T12:00:00Z",
          "endTimestamp": "2024-01-15T14:00:00Z"
        },
        "activityType": "WALKING"
      }
    },
    {
      "placeVisit": {
        "location": {
          "latitudeE7": 407128000,
          "longitudeE7": -740060000
        },
        "duration": { ... }
      }
    }
  ]
}
```

### Files with Limited Support:
- ⚠️ `Raw Signals.json` (contains raw sensor data, not processed locations)
- ⚠️ Files in `Timeline Edits/` folder (individual edit files, not the main Timeline Edits.json)

### Recommended Priority Order:
1. ✅ **`Timeline Edits.json`** (best - enhanced location data)
2. ✅ **`Timeline.json`** (good - standard format)
3. ✅ **`Location History.json`** (acceptable - basic location data)

## Alternative Export Methods

### Method 1: Google Maps Timeline Direct Export

1. Go to **[Google Maps Timeline](https://timeline.google.com/maps/timeline)**
2. Click the **Settings gear icon** (⚙️)
3. Select **"Download your Timeline data"**
4. Choose date range and format (JSON)
5. Download directly

### Method 2: Google My Activity

1. Go to **[My Activity](https://myactivity.google.com/myactivity)**
2. Filter by **"Location History"**
3. Use the **"Download your data"** option
4. Select JSON format

## Verifying the Correct File

### Quick Check with Diagnostic Tool

Once you have the new file, verify it's correct:

```bash
# Test the new file
node tools/timeline-diagnostic.js "path/to/new/Location History.json"
```

### Expected Diagnostic Output:

**For Timeline Edits.json (recommended):**
```
🏗️  STRUCTURE ANALYSIS
──────────────────────────────
Valid JSON: ✅
Timeline Objects Found: ✅
Timeline Objects Count: 11,339
Detected Format: timelineEdits
```

**For Timeline.json (legacy):**
```
🏗️  STRUCTURE ANALYSIS
──────────────────────────────
Valid JSON: ✅
Timeline Objects Found: ✅
Timeline Objects Count: 15,420
Detected Format: standard
```

### File Size Expectations:
- **Light users**: 1-10 MB
- **Moderate users**: 10-100 MB  
- **Heavy users**: 100 MB - 1 GB+
- **Years of data**: Can be several GB

## Common Issues and Solutions

### Issue 1: No Location History Available
**Cause**: Location History was disabled on your devices
**Solution**: 
1. Enable Location History in Google Account settings
2. Wait a few weeks/months for data to accumulate
3. Re-export

### Issue 2: Very Small File Size
**Cause**: Limited location tracking or short time period
**Solutions**:
- Check date range in export settings
- Verify Location History is enabled on all devices
- Consider using Google Maps more frequently

### Issue 3: Export Takes Too Long
**Cause**: Large dataset
**Solutions**:
- Export smaller date ranges (e.g., one year at a time)
- Use "2 GB" file size limit
- Be patient - large exports can take 24-48 hours

### Issue 4: Multiple JSON Files
**Situation**: Export contains multiple timeline files
**Solution**: 
- Start with the largest file
- Or combine files using the geo-images application
- Process each file separately

## Privacy and Security Notes

### Data Sensitivity
- Timeline data contains detailed location history
- Store files securely and delete after processing if desired
- Consider using local processing only

### Google Account Security
- Use app-specific passwords if you have 2FA enabled
- Review what data you're exporting
- You can delete the export from Google after downloading

## Testing Your New File

### 1. Run Diagnostic
```bash
node tools/timeline-diagnostic.js "data/Location History.json"
```

### 2. Expected Results
- ✅ Timeline Objects Found: Yes
- ✅ Timeline Objects Count: > 0
- ✅ Detected Format: standard or semantic

### 3. Run Main Application
```bash
npm start /path/to/your/photos
```

## File Organization Recommendations

### Recommended Structure:
```
data/
├── Timeline Edits.json           # Recommended - enhanced format
├── Timeline.json                 # Alternative - standard format  
├── Location History.json         # Alternative - basic format
├── location.json                 # Generated by application
└── backups/
    ├── Timeline Edits-backup.json
    └── diagnostic-reports/
```

## Next Steps After Getting Timeline File

1. **Place the timeline file**: Move your timeline file to the `data/` directory:
   - `data/Timeline Edits.json` (recommended)
   - `data/Timeline.json` (alternative)
   - `data/Location History.json` (alternative)
2. **No configuration needed**: The application automatically detects the format and file
3. **Run diagnostic**: Verify the file works correctly:
   ```bash
   node tools/timeline-diagnostic.js "data/Timeline Edits.json"
   ```
4. **Process your photos**: Run the main geo-images application

## Support

If you continue to have issues:
1. Run the diagnostic tool on your new file
2. Check the generated report for specific recommendations
3. Ensure Location History was enabled during the time period of your photos

The diagnostic tool will help identify any remaining issues with the new timeline file.