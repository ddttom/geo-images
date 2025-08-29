#!/usr/bin/env node

/**
 * Test script for formatCameraSource function
 */

// Copy the formatCameraSource function for testing
function formatCameraSource(camera) {
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

// Test cases
const testCases = [
  // Full camera info
  { make: 'Apple', model: 'iPhone 12 Pro', lens: '26mm' },
  // Make and model only
  { make: 'Canon', model: 'EOS R5', lens: null },
  // Model only
  { make: null, model: 'iPhone 13', lens: null },
  // Make only
  { make: 'Sony', model: null, lens: null },
  // Lens only
  { make: null, model: null, lens: '50mm' },
  // Empty object
  { make: null, model: null, lens: null },
  // Null input
  null,
  // Undefined input
  undefined,
  // Non-object input
  'invalid'
];

console.log('🧪 Testing formatCameraSource function:\n');

testCases.forEach((testCase, index) => {
  const result = formatCameraSource(testCase);
  console.log(`Test ${index + 1}:`);
  console.log(`  Input:  ${JSON.stringify(testCase)}`);
  console.log(`  Output: "${result}"`);
  console.log('');
});

console.log('✅ All tests completed!');