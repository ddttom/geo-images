/**
 * EXIF Service
 * 
 * Handles EXIF metadata extraction and GPS data writing for various image formats.
 * Uses piexifjs with exiftool fallback for comprehensive format support.
 * 
 * @author Tom Cranstoun <ddttom@github.com>
 */

import { readFile, writeFile, stat } from 'fs/promises';
import { extname } from 'path';
import piexif from 'piexifjs';
import { exiftool } from 'exiftool-vendored';
import sharp from 'sharp';

/**
 * Service for EXIF metadata operations
 */
class ExifService {
  constructor(logger, options = {}) {
    this.logger = logger;
    this.options = {
      useFileTimestampFallback: options.useFileTimestampFallback || false,
      ...options
    };
    
    // Formats that work well with piexifjs
    this.piexifFormats = new Set(['.jpg', '.jpeg', '.tiff', '.tif']);
    
    // Formats that require exiftool
    this.exiftoolFormats = new Set(['.cr3', '.cr2', '.nef', '.arw', '.orf', '.rw2', '.raf', '.pef', '.srw', '.dng']);
    
    // Formats that need special handling
    this.sharpFormats = new Set(['.png', '.webp', '.avif', '.heif', '.heic']);
  }

  /**
   * Extract metadata from image file
   * @param {string} filePath - Path to image file
   * @returns {Promise<Object>} Extracted metadata
   */
  async extractMetadata(filePath) {
    const extension = extname(filePath).toLowerCase();
    
    try {
      if (this.exiftoolFormats.has(extension)) {
        return await this.extractWithExiftool(filePath);
      } else if (this.piexifFormats.has(extension)) {
        return await this.extractWithPiexif(filePath);
      } else if (this.sharpFormats.has(extension)) {
        return await this.extractWithSharp(filePath);
      } else {
        // Fallback to exiftool for unknown formats
        return await this.extractWithExiftool(filePath);
      }
    } catch (error) {
      const errorMessage = error.message || error.toString() || 'Unknown EXIF error';
      this.logger.error(`Failed to extract metadata from ${filePath}`, {
        error: errorMessage,
        stack: error.stack,
        filePath,
        extension,
        attemptedMethod: this.exiftoolFormats.has(extension) ? 'exiftool' : 
                        this.piexifFormats.has(extension) ? 'piexif' : 
                        this.sharpFormats.has(extension) ? 'sharp' : 'fallback',
        stage: 'metadata_extraction'
      });
      
      // Try file timestamp fallback if enabled and no EXIF timestamp found
      if (this.options.useFileTimestampFallback) {
        try {
          const stats = await stat(filePath);
          const fileTimestamp = stats.mtime;
          
          this.logger.debug(`Using file timestamp fallback for ${filePath}: ${fileTimestamp}`);
          
          return {
            hasGPS: false,
            latitude: null,
            longitude: null,
            timestamp: fileTimestamp,
            camera: { make: null, model: null, lens: null },
            format: extension,
            source: 'file_timestamp'
          };
        } catch (statError) {
          this.logger.debug(`File timestamp fallback failed for ${filePath}: ${statError.message}`);
        }
      }
      
      return this.createEmptyMetadata();
    }
  }

  /**
   * Extract metadata using piexifjs
   * @param {string} filePath - Path to image file
   * @returns {Promise<Object>} Extracted metadata
   */
  async extractWithPiexif(filePath) {
    try {
      const imageBuffer = await readFile(filePath);
      const imageString = imageBuffer.toString('binary');
      
      const exifData = piexif.load(imageString);
      
      const metadata = {
        hasGPS: this.hasGPSData(exifData),
        latitude: this.extractLatitude(exifData),
        longitude: this.extractLongitude(exifData),
        timestamp: this.extractTimestamp(exifData),
        camera: this.extractCameraInfo(exifData),
        format: extname(filePath).toLowerCase(),
        source: 'piexif'
      };
      
      // Try file timestamp fallback if no EXIF timestamp and fallback is enabled
      if (!metadata.timestamp && this.options.useFileTimestampFallback) {
        try {
          const stats = await stat(filePath);
          metadata.timestamp = stats.mtime;
          metadata.source = 'file_timestamp_fallback';
          this.logger.debug(`Using file timestamp fallback for ${filePath}: ${stats.mtime}`);
        } catch (statError) {
          this.logger.debug(`File timestamp fallback failed for ${filePath}: ${statError.message}`);
        }
      }
      
      return metadata;
      
    } catch (error) {
      this.logger.debug(`Piexif extraction failed for ${filePath}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Extract metadata using exiftool
   * @param {string} filePath - Path to image file
   * @returns {Promise<Object>} Extracted metadata
   */
  async extractWithExiftool(filePath) {
    try {
      const tags = await exiftool.read(filePath);
      
      const metadata = {
        hasGPS: !!(tags.GPSLatitude && tags.GPSLongitude),
        latitude: tags.GPSLatitude || null,
        longitude: tags.GPSLongitude || null,
        timestamp: this.parseExiftoolTimestamp(tags),
        camera: {
          make: tags.Make || null,
          model: tags.Model || null,
          lens: tags.LensModel || null
        },
        format: extname(filePath).toLowerCase(),
        source: 'exiftool'
      };
      
      // Try file timestamp fallback if no EXIF timestamp and fallback is enabled
      if (!metadata.timestamp && this.options.useFileTimestampFallback) {
        try {
          const stats = await stat(filePath);
          metadata.timestamp = stats.mtime;
          metadata.source = 'file_timestamp_fallback';
          this.logger.debug(`Using file timestamp fallback for ${filePath}: ${stats.mtime}`);
        } catch (statError) {
          this.logger.debug(`File timestamp fallback failed for ${filePath}: ${statError.message}`);
        }
      }
      
      return metadata;
      
    } catch (error) {
      this.logger.debug(`Exiftool extraction failed for ${filePath}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Extract metadata using Sharp (for modern formats)
   * @param {string} filePath - Path to image file
   * @returns {Promise<Object>} Extracted metadata
   */
  async extractWithSharp(filePath) {
    try {
      const image = sharp(filePath);
      const metadata = await image.metadata();
      
      // Sharp doesn't extract GPS data well, fallback to exiftool
      if (metadata.exif) {
        return await this.extractWithExiftool(filePath);
      }
      
      const result = {
        hasGPS: false,
        latitude: null,
        longitude: null,
        timestamp: null,
        camera: {
          make: null,
          model: null,
          lens: null
        },
        format: extname(filePath).toLowerCase(),
        source: 'sharp'
      };
      
      // Try file timestamp fallback if enabled
      if (this.options.useFileTimestampFallback) {
        try {
          const stats = await stat(filePath);
          result.timestamp = stats.mtime;
          result.source = 'file_timestamp_fallback';
          this.logger.debug(`Using file timestamp fallback for ${filePath}: ${stats.mtime}`);
        } catch (statError) {
          this.logger.debug(`File timestamp fallback failed for ${filePath}: ${statError.message}`);
        }
      }
      
      return result;
      
    } catch (error) {
      this.logger.debug(`Sharp extraction failed for ${filePath}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Write GPS data to image file
   * @param {string} filePath - Path to image file
   * @param {Object} coordinates - GPS coordinates {latitude, longitude}
   * @returns {Promise<boolean>} Success status
   */
  async writeGPSData(filePath, coordinates) {
    const extension = extname(filePath).toLowerCase();
    
    try {
      if (this.exiftoolFormats.has(extension)) {
        return await this.writeGPSWithExiftool(filePath, coordinates);
      } else if (this.piexifFormats.has(extension)) {
        return await this.writeGPSWithPiexif(filePath, coordinates);
      } else {
        // Fallback to exiftool for other formats
        return await this.writeGPSWithExiftool(filePath, coordinates);
      }
    } catch (error) {
      const errorMessage = error.message || error.toString() || 'Unknown GPS write error';
      this.logger.error(`Failed to write GPS data to ${filePath}`, {
        error: errorMessage,
        stack: error.stack,
        filePath,
        extension,
        coordinates,
        attemptedMethod: this.exiftoolFormats.has(extension) ? 'exiftool' : 
                        this.piexifFormats.has(extension) ? 'piexif' : 'fallback',
        stage: 'gps_write'
      });
      throw new Error(`GPS write failed for ${filePath}: ${errorMessage}`);
    }
  }

  /**
   * Write GPS data using piexifjs
   * @param {string} filePath - Path to image file
   * @param {Object} coordinates - GPS coordinates
   * @returns {Promise<boolean>} Success status
   */
  async writeGPSWithPiexif(filePath, coordinates) {
    try {
      const imageBuffer = await readFile(filePath);
      const imageString = imageBuffer.toString('binary');
      
      let exifData;
      try {
        exifData = piexif.load(imageString);
      } catch {
        // Create new EXIF data if none exists
        exifData = { '0th': {}, 'Exif': {}, 'GPS': {}, '1st': {}, 'thumbnail': null };
      }
      
      // Convert coordinates to EXIF GPS format
      const gpsData = this.coordinatesToExifGPS(coordinates);
      exifData.GPS = { ...exifData.GPS, ...gpsData };
      
      // Generate new EXIF bytes
      const exifBytes = piexif.dump(exifData);
      
      // Insert EXIF data into image
      const newImageString = piexif.insert(exifBytes, imageString);
      const newImageBuffer = Buffer.from(newImageString, 'binary');
      
      // Write back to file
      await writeFile(filePath, newImageBuffer);
      
      this.logger.debug(`GPS data written to ${filePath} using piexif`);
      return true;
      
    } catch (error) {
      this.logger.error(`Piexif GPS write failed for ${filePath}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Write GPS data using exiftool
   * @param {string} filePath - Path to image file
   * @param {Object} coordinates - GPS coordinates
   * @returns {Promise<boolean>} Success status
   */
  async writeGPSWithExiftool(filePath, coordinates) {
    try {
      await exiftool.write(filePath, {
        GPSLatitude: coordinates.latitude,
        GPSLongitude: coordinates.longitude,
        GPSLatitudeRef: coordinates.latitude >= 0 ? 'N' : 'S',
        GPSLongitudeRef: coordinates.longitude >= 0 ? 'E' : 'W'
      });
      
      this.logger.debug(`GPS data written to ${filePath} using exiftool`);
      return true;
      
    } catch (error) {
      this.logger.error(`Exiftool GPS write failed for ${filePath}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Check if EXIF data contains GPS information
   * @param {Object} exifData - EXIF data from piexif
   * @returns {boolean} True if GPS data exists
   */
  hasGPSData(exifData) {
    return !!(exifData.GPS && 
              exifData.GPS[piexif.GPSIFD.GPSLatitude] && 
              exifData.GPS[piexif.GPSIFD.GPSLongitude]);
  }

  /**
   * Extract latitude from EXIF data
   * @param {Object} exifData - EXIF data from piexif
   * @returns {number|null} Latitude in decimal degrees
   */
  extractLatitude(exifData) {
    if (!this.hasGPSData(exifData)) return null;
    
    const lat = exifData.GPS[piexif.GPSIFD.GPSLatitude];
    const latRef = exifData.GPS[piexif.GPSIFD.GPSLatitudeRef];
    
    if (!lat || !latRef) return null;
    
    const decimal = this.dmsToDecimal(lat);
    return latRef === 'S' ? -decimal : decimal;
  }

  /**
   * Extract longitude from EXIF data
   * @param {Object} exifData - EXIF data from piexif
   * @returns {number|null} Longitude in decimal degrees
   */
  extractLongitude(exifData) {
    if (!this.hasGPSData(exifData)) return null;
    
    const lon = exifData.GPS[piexif.GPSIFD.GPSLongitude];
    const lonRef = exifData.GPS[piexif.GPSIFD.GPSLongitudeRef];
    
    if (!lon || !lonRef) return null;
    
    const decimal = this.dmsToDecimal(lon);
    return lonRef === 'W' ? -decimal : decimal;
  }

  /**
   * Extract timestamp from EXIF data
   * @param {Object} exifData - EXIF data from piexif
   * @returns {Date|null} Timestamp as Date object
   */
  extractTimestamp(exifData) {
    // Try different timestamp fields in order of preference
    const timestampFields = [
      exifData.Exif?.[piexif.ExifIFD.DateTimeOriginal],
      exifData.Exif?.[piexif.ExifIFD.DateTime],
      exifData['0th']?.[piexif.ImageIFD.DateTime]
    ];
    
    for (const timestamp of timestampFields) {
      if (timestamp && typeof timestamp === 'string') {
        try {
          // EXIF timestamp format: "YYYY:MM:DD HH:MM:SS"
          // Replace first two colons with dashes for ISO format
          const dateStr = timestamp.replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3');
          const parsedDate = new Date(dateStr);
          
          // Validate the parsed date
          if (!isNaN(parsedDate.getTime()) && parsedDate.getFullYear() > 1900) {
            return parsedDate;
          } else {
            this.logger.debug(`Invalid parsed date from timestamp: ${timestamp} -> ${dateStr} -> ${parsedDate}`);
          }
        } catch (error) {
          this.logger.debug(`Failed to parse timestamp: ${timestamp}`, error.message);
        }
      }
    }
    
    this.logger.debug('No valid timestamp found in EXIF data', {
      availableFields: timestampFields.filter(Boolean)
    });
    
    return null;
  }

  /**
   * Extract camera information from EXIF data
   * @param {Object} exifData - EXIF data from piexif
   * @returns {Object} Camera information
   */
  extractCameraInfo(exifData) {
    return {
      make: exifData['0th'][piexif.ImageIFD.Make] || null,
      model: exifData['0th'][piexif.ImageIFD.Model] || null,
      lens: exifData.Exif[piexif.ExifIFD.LensModel] || null
    };
  }

  /**
   * Parse timestamp from exiftool output
   * @param {Object} tags - Exiftool tags
   * @returns {Date|null} Parsed timestamp
   */
  parseExiftoolTimestamp(tags) {
    const timestampFields = [
      tags.DateTimeOriginal,
      tags.CreateDate,
      tags.ModifyDate,
      tags.DateTime
    ];
    
    for (const timestamp of timestampFields) {
      if (timestamp) {
        try {
          return new Date(timestamp);
        } catch (error) {
          this.logger.debug(`Failed to parse exiftool timestamp: ${timestamp}`);
        }
      }
    }
    
    return null;
  }

  /**
   * Convert DMS (Degrees, Minutes, Seconds) to decimal degrees
   * @param {Array} dms - DMS array from EXIF
   * @returns {number} Decimal degrees
   */
  dmsToDecimal(dms) {
    if (!Array.isArray(dms) || dms.length !== 3) return 0;
    
    const degrees = dms[0][0] / dms[0][1];
    const minutes = dms[1][0] / dms[1][1];
    const seconds = dms[2][0] / dms[2][1];
    
    return degrees + (minutes / 60) + (seconds / 3600);
  }

  /**
   * Convert decimal coordinates to EXIF GPS format
   * @param {Object} coordinates - {latitude, longitude}
   * @returns {Object} EXIF GPS data
   */
  coordinatesToExifGPS(coordinates) {
    const latDMS = this.decimalToDMS(Math.abs(coordinates.latitude));
    const lonDMS = this.decimalToDMS(Math.abs(coordinates.longitude));
    
    return {
      [piexif.GPSIFD.GPSLatitude]: latDMS,
      [piexif.GPSIFD.GPSLatitudeRef]: coordinates.latitude >= 0 ? 'N' : 'S',
      [piexif.GPSIFD.GPSLongitude]: lonDMS,
      [piexif.GPSIFD.GPSLongitudeRef]: coordinates.longitude >= 0 ? 'E' : 'W'
    };
  }

  /**
   * Convert decimal degrees to DMS format
   * @param {number} decimal - Decimal degrees
   * @returns {Array} DMS array for EXIF
   */
  decimalToDMS(decimal) {
    const degrees = Math.floor(decimal);
    const minutesFloat = (decimal - degrees) * 60;
    const minutes = Math.floor(minutesFloat);
    const seconds = (minutesFloat - minutes) * 60;
    
    return [
      [degrees, 1],
      [minutes, 1],
      [Math.round(seconds * 1000), 1000]
    ];
  }

  /**
   * Create empty metadata object
   * @returns {Object} Empty metadata
   */
  createEmptyMetadata() {
    return {
      hasGPS: false,
      latitude: null,
      longitude: null,
      timestamp: null,
      camera: {
        make: null,
        model: null,
        lens: null
      },
      format: null,
      source: 'empty'
    };
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    try {
      await exiftool.end();
      this.logger.debug('Exiftool process terminated');
    } catch (error) {
      this.logger.warn('Failed to cleanup exiftool:', error.message);
    }
  }
}

export default ExifService;