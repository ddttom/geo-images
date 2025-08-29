/**
 * Camera Source Utility
 * 
 * Provides camera-based source attribution formatting for GPS coordinate entries.
 * Used by both create-geo.js and the main application for consistent source attribution.
 * 
 * @author Tom Cranstoun <ddttom@github.com>
 */

/**
 * Format camera information into a descriptive source string
 * @param {Object} camera - Camera metadata object with make, model, lens properties
 * @returns {string} Formatted camera source string or fallback
 */
export function formatCameraSource(camera) {
  if (!camera || typeof camera !== 'object') {
    return 'create-geo';
  }

  const { make, model, lens } = camera;
  
  // If no camera info at all, use fallback
  if (!make && !model && !lens) {
    return 'create-geo';
  }

  let source = '';
  
  // Build the source string with available information
  if (make && model) {
    source = `${make} ${model}`;
  } else if (model) {
    source = model;
  } else if (make) {
    source = make;
  }
  
  // Add lens information if available
  if (lens && source) {
    source += ` with ${lens}`;
  } else if (lens && !source) {
    source = `Camera with ${lens}`;
  }
  
  // Final fallback if we couldn't build a meaningful string
  return source || 'create-geo';
}

/**
 * Determine if a source should use camera-based attribution
 * Only applies to EXIF-derived GPS coordinates, preserves timeline sources
 * @param {string} originalSource - The original source type
 * @returns {boolean} Whether to apply camera-based attribution
 */
export function shouldUseCameraAttribution(originalSource) {
  // Only apply camera attribution to EXIF-based sources
  const exifSources = [
    'exif_metadata',
    'image_exif',
    'piexif',
    'exiftool',
    'sharp'
  ];
  
  return exifSources.includes(originalSource);
}

/**
 * Get camera-based source with fallback to original source
 * Preserves timeline and interpolation sources unchanged
 * @param {Object} camera - Camera metadata object
 * @param {string} originalSource - Original source attribution
 * @returns {string} Final source attribution
 */
export function getCameraOrOriginalSource(camera, originalSource) {
  // Preserve timeline and interpolation sources
  if (!shouldUseCameraAttribution(originalSource)) {
    return originalSource;
  }
  
  // Use camera-based attribution for EXIF sources
  return formatCameraSource(camera);
}