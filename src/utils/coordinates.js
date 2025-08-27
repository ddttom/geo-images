/**
 * Coordinates Utility
 * 
 * Provides GPS coordinate validation, conversion, and manipulation functions.
 * Supports various coordinate systems and formats.
 * 
 * @author Tom Cranstoun <ddttom@github.com>
 */

/**
 * Validate GPS coordinates
 * @param {number} latitude - Latitude in decimal degrees
 * @param {number} longitude - Longitude in decimal degrees
 * @returns {boolean} True if coordinates are valid
 */
export function validateCoordinates(latitude, longitude) {
  // Check if values are numbers
  if (typeof latitude !== 'number' || typeof longitude !== 'number') {
    return false;
  }
  
  // Check for NaN or Infinity
  if (!isFinite(latitude) || !isFinite(longitude)) {
    return false;
  }
  
  // Check latitude bounds (-90 to 90)
  if (latitude < -90 || latitude > 90) {
    return false;
  }
  
  // Check longitude bounds (-180 to 180)
  if (longitude < -180 || longitude > 180) {
    return false;
  }
  
  // Exclude null island (0,0) as it's often a placeholder
  if (latitude === 0 && longitude === 0) {
    return false;
  }
  
  return true;
}

/**
 * Convert decimal degrees to degrees, minutes, seconds (DMS)
 * @param {number} decimal - Decimal degrees
 * @returns {Object} DMS object with degrees, minutes, seconds
 */
export function decimalToDMS(decimal) {
  const absolute = Math.abs(decimal);
  const degrees = Math.floor(absolute);
  const minutesFloat = (absolute - degrees) * 60;
  const minutes = Math.floor(minutesFloat);
  const seconds = (minutesFloat - minutes) * 60;
  
  return {
    degrees,
    minutes,
    seconds: Math.round(seconds * 1000) / 1000, // Round to 3 decimal places
    direction: decimal >= 0 ? 'positive' : 'negative'
  };
}

/**
 * Convert DMS to decimal degrees
 * @param {number} degrees - Degrees
 * @param {number} minutes - Minutes
 * @param {number} seconds - Seconds
 * @param {string} direction - Direction ('N', 'S', 'E', 'W' or 'positive', 'negative')
 * @returns {number} Decimal degrees
 */
export function dmsToDecimal(degrees, minutes, seconds, direction) {
  const baseDecimal = degrees + (minutes / 60) + (seconds / 3600);
  
  // Apply direction
  if (direction === 'S' || direction === 'W' || direction === 'negative') {
    return -baseDecimal;
  }
  
  return baseDecimal;
  
  return decimal;
}

/**
 * Format coordinates for display
 * @param {number} latitude - Latitude in decimal degrees
 * @param {number} longitude - Longitude in decimal degrees
 * @param {string} format - Format type ('decimal', 'dms', 'dm')
 * @param {number} precision - Decimal precision for decimal format
 * @returns {string} Formatted coordinate string
 */
export function formatCoordinates(latitude, longitude, format = 'decimal', precision = 6) {
  if (!validateCoordinates(latitude, longitude)) {
    return 'Invalid coordinates';
  }
  
  switch (format.toLowerCase()) {
    case 'decimal':
      return `${latitude.toFixed(precision)}, ${longitude.toFixed(precision)}`;
      
    case 'dms': {
      const latDMS = decimalToDMS(latitude);
      const lonDMS = decimalToDMS(longitude);
      const latDir = latitude >= 0 ? 'N' : 'S';
      const lonDir = longitude >= 0 ? 'E' : 'W';
      
      return `${latDMS.degrees}°${latDMS.minutes}'${latDMS.seconds}"${latDir}, ${lonDMS.degrees}°${lonDMS.minutes}'${lonDMS.seconds}"${lonDir}`;
    }
    
    case 'dm': {
      const latDMS = decimalToDMS(latitude);
      const lonDMS = decimalToDMS(longitude);
      const latDir = latitude >= 0 ? 'N' : 'S';
      const lonDir = longitude >= 0 ? 'E' : 'W';
      const latMinutes = latDMS.minutes + (latDMS.seconds / 60);
      const lonMinutes = lonDMS.minutes + (lonDMS.seconds / 60);
      
      return `${latDMS.degrees}°${latMinutes.toFixed(3)}'${latDir}, ${lonDMS.degrees}°${lonMinutes.toFixed(3)}'${lonDir}`;
    }
    
    default:
      return formatCoordinates(latitude, longitude, 'decimal', precision);
  }
}

/**
 * Parse coordinate string in various formats
 * @param {string} coordString - Coordinate string to parse
 * @returns {Object|null} Parsed coordinates {latitude, longitude} or null if invalid
 */
export function parseCoordinates(coordString) {
  if (!coordString || typeof coordString !== 'string') {
    return null;
  }
  
  const cleaned = coordString.trim();
  
  // Try decimal format first (e.g., "40.7128, -74.0060")
  const decimalMatch = cleaned.match(/^(-?\d+\.?\d*),\s*(-?\d+\.?\d*)$/);
  if (decimalMatch) {
    const lat = parseFloat(decimalMatch[1]);
    const lon = parseFloat(decimalMatch[2]);
    
    if (validateCoordinates(lat, lon)) {
      return { latitude: lat, longitude: lon };
    }
  }
  
  // Try DMS format (e.g., "40°42'46"N, 74°0'21"W")
  const dmsMatch = cleaned.match(/(\d+)°(\d+)'([\d.]+)"([NSEW]),?\s*(\d+)°(\d+)'([\d.]+)"([NSEW])/i);
  if (dmsMatch) {
    const lat = dmsToDecimal(
      parseInt(dmsMatch[1]),
      parseInt(dmsMatch[2]),
      parseFloat(dmsMatch[3]),
      dmsMatch[4].toUpperCase()
    );
    
    const lon = dmsToDecimal(
      parseInt(dmsMatch[5]),
      parseInt(dmsMatch[6]),
      parseFloat(dmsMatch[7]),
      dmsMatch[8].toUpperCase()
    );
    
    if (validateCoordinates(lat, lon)) {
      return { latitude: lat, longitude: lon };
    }
  }
  
  return null;
}

/**
 * Calculate the center point of multiple coordinates
 * @param {Array} coordinates - Array of {latitude, longitude} objects
 * @returns {Object|null} Center coordinates or null if invalid input
 */
export function calculateCenter(coordinates) {
  if (!Array.isArray(coordinates) || coordinates.length === 0) {
    return null;
  }
  
  // Filter valid coordinates
  const validCoords = coordinates.filter(coord => 
    validateCoordinates(coord.latitude, coord.longitude)
  );
  
  if (validCoords.length === 0) {
    return null;
  }
  
  // Calculate average
  const sumLat = validCoords.reduce((sum, coord) => sum + coord.latitude, 0);
  const sumLon = validCoords.reduce((sum, coord) => sum + coord.longitude, 0);
  
  return {
    latitude: sumLat / validCoords.length,
    longitude: sumLon / validCoords.length
  };
}

/**
 * Check if coordinates are within a bounding box
 * @param {number} latitude - Latitude to check
 * @param {number} longitude - Longitude to check
 * @param {Object} bounds - Bounding box {north, south, east, west}
 * @returns {boolean} True if coordinates are within bounds
 */
export function isWithinBounds(latitude, longitude, bounds) {
  if (!validateCoordinates(latitude, longitude)) {
    return false;
  }
  
  const { north, south, east, west } = bounds;
  
  // Check latitude bounds
  if (latitude < south || latitude > north) {
    return false;
  }
  
  // Check longitude bounds (handle date line crossing)
  if (west <= east) {
    // Normal case (doesn't cross date line)
    return longitude >= west && longitude <= east;
  } else {
    // Crosses date line
    return longitude >= west || longitude <= east;
  }
}

/**
 * Create a bounding box around a center point
 * @param {number} centerLat - Center latitude
 * @param {number} centerLon - Center longitude
 * @param {number} radiusKm - Radius in kilometers
 * @returns {Object} Bounding box {north, south, east, west}
 */
export function createBoundingBox(centerLat, centerLon, radiusKm) {
  if (!validateCoordinates(centerLat, centerLon) || radiusKm <= 0) {
    return null;
  }
  
  // Approximate degrees per kilometer
  const latDegreesPerKm = 1 / 111.32; // Roughly constant
  const lonDegreesPerKm = 1 / (111.32 * Math.cos(centerLat * Math.PI / 180));
  
  const latOffset = radiusKm * latDegreesPerKm;
  const lonOffset = radiusKm * lonDegreesPerKm;
  
  return {
    north: Math.min(90, centerLat + latOffset),
    south: Math.max(-90, centerLat - latOffset),
    east: centerLon + lonOffset,
    west: centerLon - lonOffset
  };
}

/**
 * Normalize longitude to -180 to 180 range
 * @param {number} longitude - Longitude to normalize
 * @returns {number} Normalized longitude
 */
export function normalizeLongitude(longitude) {
  if (typeof longitude !== 'number' || !isFinite(longitude)) {
    return 0;
  }
  
  const normalized = longitude % 360;
  
  if (normalized > 180) {
    return normalized - 360;
  } else if (normalized < -180) {
    return normalized + 360;
  }
  
  return normalized;
}

/**
 * Normalize latitude to -90 to 90 range
 * @param {number} latitude - Latitude to normalize
 * @returns {number} Normalized latitude
 */
export function normalizeLatitude(latitude) {
  if (typeof latitude !== 'number' || !isFinite(latitude)) {
    return 0;
  }
  
  // Clamp to valid range
  return Math.max(-90, Math.min(90, latitude));
}

/**
 * Convert coordinates to different reference systems
 * @param {number} latitude - Latitude in WGS84
 * @param {number} longitude - Longitude in WGS84
 * @param {string} targetSystem - Target coordinate system
 * @returns {Object} Converted coordinates
 */
export function convertCoordinateSystem(latitude, longitude, targetSystem = 'WGS84') {
  if (!validateCoordinates(latitude, longitude)) {
    return null;
  }
  
  // For now, we only support WGS84 (most common for GPS)
  // Additional coordinate systems can be added as needed
  switch (targetSystem.toUpperCase()) {
    case 'WGS84':
    default:
      return { latitude, longitude, system: 'WGS84' };
  }
}

/**
 * Generate a random coordinate within bounds (for testing)
 * @param {Object} bounds - Bounding box {north, south, east, west}
 * @returns {Object} Random coordinates {latitude, longitude}
 */
export function generateRandomCoordinate(bounds = { north: 90, south: -90, east: 180, west: -180 }) {
  const { north, south, east, west } = bounds;
  
  const latitude = south + Math.random() * (north - south);
  let longitude;
  
  if (west <= east) {
    longitude = west + Math.random() * (east - west);
  } else {
    // Handle date line crossing
    const range1 = 180 - west;
    const range2 = east - (-180);
    const totalRange = range1 + range2;
    
    if (Math.random() * totalRange < range1) {
      longitude = west + Math.random() * range1;
    } else {
      longitude = -180 + Math.random() * range2;
    }
  }
  
  return {
    latitude: normalizeLatitude(latitude),
    longitude: normalizeLongitude(longitude)
  };
}

/**
 * Check if two coordinates are approximately equal
 * @param {Object} coord1 - First coordinate {latitude, longitude}
 * @param {Object} coord2 - Second coordinate {latitude, longitude}
 * @param {number} tolerance - Tolerance in decimal degrees (default: 0.0001 ≈ 11m)
 * @returns {boolean} True if coordinates are approximately equal
 */
export function coordinatesEqual(coord1, coord2, tolerance = 0.0001) {
  if (!coord1 || !coord2) return false;
  
  const latDiff = Math.abs(coord1.latitude - coord2.latitude);
  const lonDiff = Math.abs(coord1.longitude - coord2.longitude);
  
  return latDiff <= tolerance && lonDiff <= tolerance;
}