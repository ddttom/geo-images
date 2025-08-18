/**
 * Distance Utility
 * 
 * Provides functions for calculating distances and spatial relationships
 * between GPS coordinates using various algorithms.
 * 
 * @author Tom Cranstoun <ddttom@github.com>
 */

/**
 * Calculate distance between two points using Haversine formula
 * @param {number} lat1 - Latitude of first point
 * @param {number} lon1 - Longitude of first point
 * @param {number} lat2 - Latitude of second point
 * @param {number} lon2 - Longitude of second point
 * @returns {number} Distance in meters
 */
export function calculateDistance(lat1, lon1, lat2, lon2) {
  // Validate inputs
  if (!isValidCoordinate(lat1, lon1) || !isValidCoordinate(lat2, lon2)) {
    return NaN;
  }
  
  // Earth's radius in meters
  const R = 6371000;
  
  // Convert degrees to radians
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;
  
  // Haversine formula
  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  
  return R * c;
}

/**
 * Calculate bearing between two points
 * @param {number} lat1 - Latitude of first point
 * @param {number} lon1 - Longitude of first point
 * @param {number} lat2 - Latitude of second point
 * @param {number} lon2 - Longitude of second point
 * @returns {number} Bearing in degrees (0-360)
 */
export function calculateBearing(lat1, lon1, lat2, lon2) {
  // Validate inputs
  if (!isValidCoordinate(lat1, lon1) || !isValidCoordinate(lat2, lon2)) {
    return NaN;
  }
  
  // Convert degrees to radians
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;
  
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  
  const θ = Math.atan2(y, x);
  
  // Convert to degrees and normalize to 0-360
  return (θ * 180 / Math.PI + 360) % 360;
}

/**
 * Calculate destination point given start point, bearing, and distance
 * @param {number} lat - Starting latitude
 * @param {number} lon - Starting longitude
 * @param {number} bearing - Bearing in degrees
 * @param {number} distance - Distance in meters
 * @returns {Object} Destination coordinates {latitude, longitude}
 */
export function calculateDestination(lat, lon, bearing, distance) {
  // Validate inputs
  if (!isValidCoordinate(lat, lon) || typeof bearing !== 'number' || typeof distance !== 'number') {
    return null;
  }
  
  // Earth's radius in meters
  const R = 6371000;
  
  // Convert to radians
  const φ1 = lat * Math.PI / 180;
  const λ1 = lon * Math.PI / 180;
  const θ = bearing * Math.PI / 180;
  
  const δ = distance / R; // Angular distance
  
  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ));
  const λ2 = λ1 + Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ1),
                             Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2));
  
  return {
    latitude: φ2 * 180 / Math.PI,
    longitude: ((λ2 * 180 / Math.PI) + 540) % 360 - 180 // Normalize to -180 to 180
  };
}

/**
 * Calculate the midpoint between two coordinates
 * @param {number} lat1 - Latitude of first point
 * @param {number} lon1 - Longitude of first point
 * @param {number} lat2 - Latitude of second point
 * @param {number} lon2 - Longitude of second point
 * @returns {Object} Midpoint coordinates {latitude, longitude}
 */
export function calculateMidpoint(lat1, lon1, lat2, lon2) {
  // Validate inputs
  if (!isValidCoordinate(lat1, lon1) || !isValidCoordinate(lat2, lon2)) {
    return null;
  }
  
  // Convert to radians
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;
  const λ1 = lon1 * Math.PI / 180;
  
  const Bx = Math.cos(φ2) * Math.cos(Δλ);
  const By = Math.cos(φ2) * Math.sin(Δλ);
  
  const φ3 = Math.atan2(Math.sin(φ1) + Math.sin(φ2),
                        Math.sqrt((Math.cos(φ1) + Bx) * (Math.cos(φ1) + Bx) + By * By));
  const λ3 = λ1 + Math.atan2(By, Math.cos(φ1) + Bx);
  
  return {
    latitude: φ3 * 180 / Math.PI,
    longitude: ((λ3 * 180 / Math.PI) + 540) % 360 - 180
  };
}

/**
 * Check if a point is within a certain distance of another point
 * @param {number} lat1 - Latitude of first point
 * @param {number} lon1 - Longitude of first point
 * @param {number} lat2 - Latitude of second point
 * @param {number} lon2 - Longitude of second point
 * @param {number} maxDistance - Maximum distance in meters
 * @returns {boolean} True if within distance
 */
export function isWithinDistance(lat1, lon1, lat2, lon2, maxDistance) {
  const distance = calculateDistance(lat1, lon1, lat2, lon2);
  return !isNaN(distance) && distance <= maxDistance;
}

/**
 * Find the closest point from an array of coordinates
 * @param {number} targetLat - Target latitude
 * @param {number} targetLon - Target longitude
 * @param {Array} coordinates - Array of {latitude, longitude} objects
 * @returns {Object|null} Closest point with distance, or null if none found
 */
export function findClosestPoint(targetLat, targetLon, coordinates) {
  if (!isValidCoordinate(targetLat, targetLon) || !Array.isArray(coordinates)) {
    return null;
  }
  
  let closestPoint = null;
  let minDistance = Infinity;
  
  coordinates.forEach((coord, index) => {
    if (coord && typeof coord.latitude === 'number' && typeof coord.longitude === 'number') {
      const distance = calculateDistance(targetLat, targetLon, coord.latitude, coord.longitude);
      
      if (!isNaN(distance) && distance < minDistance) {
        minDistance = distance;
        closestPoint = {
          ...coord,
          distance,
          index
        };
      }
    }
  });
  
  return closestPoint;
}

/**
 * Find all points within a certain radius
 * @param {number} centerLat - Center latitude
 * @param {number} centerLon - Center longitude
 * @param {Array} coordinates - Array of {latitude, longitude} objects
 * @param {number} radius - Radius in meters
 * @returns {Array} Array of points within radius with distances
 */
export function findPointsWithinRadius(centerLat, centerLon, coordinates, radius) {
  if (!isValidCoordinate(centerLat, centerLon) || !Array.isArray(coordinates)) {
    return [];
  }
  
  const pointsWithinRadius = [];
  
  coordinates.forEach((coord, index) => {
    if (coord && typeof coord.latitude === 'number' && typeof coord.longitude === 'number') {
      const distance = calculateDistance(centerLat, centerLon, coord.latitude, coord.longitude);
      
      if (!isNaN(distance) && distance <= radius) {
        pointsWithinRadius.push({
          ...coord,
          distance,
          index
        });
      }
    }
  });
  
  // Sort by distance
  return pointsWithinRadius.sort((a, b) => a.distance - b.distance);
}

/**
 * Calculate the area of a polygon defined by coordinates
 * @param {Array} coordinates - Array of {latitude, longitude} objects
 * @returns {number} Area in square meters
 */
export function calculatePolygonArea(coordinates) {
  if (!Array.isArray(coordinates) || coordinates.length < 3) {
    return 0;
  }
  
  // Earth's radius in meters
  const R = 6371000;
  
  let area = 0;
  const n = coordinates.length;
  
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const coord1 = coordinates[i];
    const coord2 = coordinates[j];
    
    if (!isValidCoordinate(coord1.latitude, coord1.longitude) ||
        !isValidCoordinate(coord2.latitude, coord2.longitude)) {
      continue;
    }
    
    // Convert to radians
    const lat1 = coord1.latitude * Math.PI / 180;
    const lat2 = coord2.latitude * Math.PI / 180;
    const lon1 = coord1.longitude * Math.PI / 180;
    const lon2 = coord2.longitude * Math.PI / 180;
    
    area += (lon2 - lon1) * (2 + Math.sin(lat1) + Math.sin(lat2));
  }
  
  area = Math.abs(area * R * R / 2);
  return area;
}

/**
 * Calculate speed between two points with timestamps
 * @param {number} lat1 - Latitude of first point
 * @param {number} lon1 - Longitude of first point
 * @param {Date} time1 - Timestamp of first point
 * @param {number} lat2 - Latitude of second point
 * @param {number} lon2 - Longitude of second point
 * @param {Date} time2 - Timestamp of second point
 * @returns {Object} Speed data {speed, distance, time, unit}
 */
export function calculateSpeed(lat1, lon1, time1, lat2, lon2, time2) {
  // Validate inputs
  if (!isValidCoordinate(lat1, lon1) || !isValidCoordinate(lat2, lon2) ||
      !(time1 instanceof Date) || !(time2 instanceof Date)) {
    return null;
  }
  
  const distance = calculateDistance(lat1, lon1, lat2, lon2); // meters
  const timeDiff = Math.abs(time2.getTime() - time1.getTime()); // milliseconds
  
  if (timeDiff === 0) {
    return {
      speed: 0,
      distance,
      time: 0,
      unit: 'm/s'
    };
  }
  
  const timeSeconds = timeDiff / 1000;
  const speedMps = distance / timeSeconds; // meters per second
  
  return {
    speed: speedMps,
    speedKmh: speedMps * 3.6, // km/h
    speedMph: speedMps * 2.237, // mph
    distance,
    time: timeSeconds,
    unit: 'm/s'
  };
}

/**
 * Interpolate position between two points based on time
 * @param {number} lat1 - Latitude of first point
 * @param {number} lon1 - Longitude of first point
 * @param {Date} time1 - Timestamp of first point
 * @param {number} lat2 - Latitude of second point
 * @param {number} lon2 - Longitude of second point
 * @param {Date} time2 - Timestamp of second point
 * @param {Date} targetTime - Target timestamp for interpolation
 * @returns {Object|null} Interpolated coordinates {latitude, longitude}
 */
export function interpolatePosition(lat1, lon1, time1, lat2, lon2, time2, targetTime) {
  // Validate inputs
  if (!isValidCoordinate(lat1, lon1) || !isValidCoordinate(lat2, lon2) ||
      !(time1 instanceof Date) || !(time2 instanceof Date) || !(targetTime instanceof Date)) {
    return null;
  }
  
  const time1Ms = time1.getTime();
  const time2Ms = time2.getTime();
  const targetMs = targetTime.getTime();
  
  // Check if target time is between the two points
  if (targetMs < Math.min(time1Ms, time2Ms) || targetMs > Math.max(time1Ms, time2Ms)) {
    return null;
  }
  
  // Calculate interpolation ratio
  const totalTime = Math.abs(time2Ms - time1Ms);
  if (totalTime === 0) {
    return { latitude: lat1, longitude: lon1 };
  }
  
  const targetTime_offset = Math.abs(targetMs - time1Ms);
  const ratio = targetTime_offset / totalTime;
  
  // Linear interpolation
  const interpolatedLat = lat1 + (lat2 - lat1) * ratio;
  const interpolatedLon = lon1 + (lon2 - lon1) * ratio;
  
  return {
    latitude: interpolatedLat,
    longitude: interpolatedLon,
    ratio,
    confidence: calculateInterpolationConfidence(lat1, lon1, time1, lat2, lon2, time2)
  };
}

/**
 * Calculate confidence score for interpolation
 * @param {number} lat1 - Latitude of first point
 * @param {number} lon1 - Longitude of first point
 * @param {Date} time1 - Timestamp of first point
 * @param {number} lat2 - Latitude of second point
 * @param {number} lon2 - Longitude of second point
 * @param {Date} time2 - Timestamp of second point
 * @returns {number} Confidence score (0-1)
 */
export function calculateInterpolationConfidence(lat1, lon1, time1, lat2, lon2, time2) {
  const distance = calculateDistance(lat1, lon1, lat2, lon2);
  const timeDiff = Math.abs(time2.getTime() - time1.getTime()) / 1000 / 60; // minutes
  
  // Distance confidence (closer points = higher confidence)
  const distanceConfidence = Math.max(0, 1 - (distance / 10000)); // 10km max
  
  // Time confidence (shorter time span = higher confidence)
  const timeConfidence = Math.max(0, 1 - (timeDiff / 120)); // 2 hours max
  
  // Speed confidence (reasonable speed = higher confidence)
  const speed = distance / (timeDiff * 60); // m/s
  const maxReasonableSpeed = 50; // 50 m/s ≈ 180 km/h
  const speedConfidence = speed <= maxReasonableSpeed ? 1 : Math.max(0, 1 - (speed - maxReasonableSpeed) / maxReasonableSpeed);
  
  return (distanceConfidence + timeConfidence + speedConfidence) / 3;
}

/**
 * Validate coordinate values
 * @param {number} lat - Latitude
 * @param {number} lon - Longitude
 * @returns {boolean} True if valid
 */
function isValidCoordinate(lat, lon) {
  return typeof lat === 'number' && typeof lon === 'number' &&
         !isNaN(lat) && !isNaN(lon) &&
         lat >= -90 && lat <= 90 &&
         lon >= -180 && lon <= 180;
}

/**
 * Convert distance to human readable format
 * @param {number} meters - Distance in meters
 * @param {string} unit - Preferred unit ('metric' or 'imperial')
 * @returns {string} Formatted distance string
 */
export function formatDistance(meters, unit = 'metric') {
  if (typeof meters !== 'number' || isNaN(meters)) {
    return 'Unknown distance';
  }
  
  if (unit === 'imperial') {
    const feet = meters * 3.28084;
    const miles = meters * 0.000621371;
    
    if (miles >= 1) {
      return `${miles.toFixed(1)} mi`;
    } else {
      return `${Math.round(feet)} ft`;
    }
  } else {
    // Metric
    if (meters >= 1000) {
      return `${(meters / 1000).toFixed(1)} km`;
    } else {
      return `${Math.round(meters)} m`;
    }
  }
}

/**
 * Calculate great circle distance (alternative to Haversine for very long distances)
 * @param {number} lat1 - Latitude of first point
 * @param {number} lon1 - Longitude of first point
 * @param {number} lat2 - Latitude of second point
 * @param {number} lon2 - Longitude of second point
 * @returns {number} Distance in meters
 */
export function calculateGreatCircleDistance(lat1, lon1, lat2, lon2) {
  // Validate inputs
  if (!isValidCoordinate(lat1, lon1) || !isValidCoordinate(lat2, lon2)) {
    return NaN;
  }
  
  // Earth's radius in meters
  const R = 6371000;
  
  // Convert degrees to radians
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const λ1 = lon1 * Math.PI / 180;
  const λ2 = lon2 * Math.PI / 180;
  
  // Great circle distance using spherical law of cosines
  const distance = Math.acos(
    Math.sin(φ1) * Math.sin(φ2) + 
    Math.cos(φ1) * Math.cos(φ2) * Math.cos(λ2 - λ1)
  ) * R;
  
  return distance;
}