# Configuration Guide

This document explains how to configure the geo-images application, including the new configurable photo directory feature.

## Environment Variables

The application uses environment variables for configuration. Copy `.env.example` to `.env` and customize the values as needed.

### Photo Directory Configuration

#### DEFAULT_PHOTO_DIR

**Description**: Configures the default photo directory for image processing operations.

**Default Value**: `~/pics`

**Supported Path Formats**:
- **Tilde expansion**: `~/pics` (expands to user's home directory + pics)
- **Absolute paths**: `/home/user/photos` or `C:\Users\User\Photos`
- **Relative paths**: `./images` or `../photos`

**Examples**:
```bash
# Use home directory pics folder (default)
DEFAULT_PHOTO_DIR=~/pics

# Use absolute path
DEFAULT_PHOTO_DIR=/home/user/my-photos

# Use relative path from project root
DEFAULT_PHOTO_DIR=./test-images

# Windows absolute path
DEFAULT_PHOTO_DIR=C:\Users\User\Pictures
```

#### Usage in Application

The `DEFAULT_PHOTO_DIR` environment variable is used in multiple places:

1. **Main Application** (`src/index.js`):
   - Used as default value when prompting user for photo directory
   - Automatically resolved with proper path expansion
   - Falls back to `~/pics` if not set

2. **Create Script** (`create-geo.js`):
   - Used as default scan directory for batch operations
   - Consistent with main application configuration

3. **Configuration Object**:
   - Stored in main config object for consistency
   - Available throughout the application lifecycle

#### Path Resolution

The application includes a robust path resolution system:

- **Tilde Expansion**: `~/` is automatically expanded to the user's home directory
- **Cross-Platform**: Works on Windows, macOS, and Linux
- **Absolute Path Detection**: Recognizes and handles absolute paths correctly
- **Relative Path Resolution**: Resolves relative paths from the current working directory

#### Implementation Details

**Utility Function**: `resolvePath()` in `src/utils/input.js`
```javascript
import { resolvePath } from './src/utils/input.js';

// Examples of path resolution
resolvePath('~/pics')           // → /home/user/pics
resolvePath('./images')         // → /current/working/dir/images
resolvePath('/absolute/path')   // → /absolute/path
```

**Configuration Integration**:
```javascript
// In src/index.js
const envDefault = process.env.DEFAULT_PHOTO_DIR || '~/pics';
const defaultPath = resolvePath(envDefault);

// In create-geo.js
defaultScanDirectory: resolvePath(process.env.DEFAULT_PHOTO_DIR || '~/pics')
```

## Migration from Hardcoded Paths

### Before (Hardcoded)
```javascript
// Old hardcoded approach
const defaultPath = join(process.env.HOME || process.env.USERPROFILE || '', 'pics');
```

### After (Configurable)
```javascript
// New configurable approach
const envDefault = process.env.DEFAULT_PHOTO_DIR || '~/pics';
const defaultPath = resolvePath(envDefault);
```

## Benefits

1. **Flexibility**: Users can configure photo directory via environment variables
2. **Consistency**: Same configuration used across all application components
3. **Cross-Platform**: Proper path handling for Windows, macOS, and Linux
4. **Backward Compatibility**: Maintains default `~/pics` behavior if not configured
5. **Path Safety**: Robust path resolution handles edge cases and invalid inputs

## Configuration Best Practices

1. **Use .env file**: Store configuration in `.env` file for easy management
2. **Test paths**: Verify that configured paths exist and are accessible
3. **Use absolute paths**: For production deployments, consider using absolute paths
4. **Document changes**: Update team documentation when changing default paths
5. **Backup important directories**: Ensure photo directories are backed up before processing

## Troubleshooting

### Common Issues

**Path not found**: Ensure the configured directory exists and is accessible
```bash
# Check if directory exists
ls -la ~/pics
```

**Permission denied**: Verify read/write permissions on the configured directory
```bash
# Check permissions
ls -ld ~/pics
```

**Tilde not expanding**: Ensure you're using the `resolvePath()` utility function

**Windows path issues**: Use forward slashes or properly escape backslashes
```bash
# Good
DEFAULT_PHOTO_DIR=C:/Users/User/Pictures

# Also good (escaped)
DEFAULT_PHOTO_DIR=C:\\Users\\User\\Pictures
```

## Related Files

- `.env.example` - Environment variable template
- `src/utils/input.js` - Path resolution utilities
- `src/index.js` - Main application configuration
- `create-geo.js` - Batch processing script configuration