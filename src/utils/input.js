/**
 * Input Utility
 * 
 * Provides user interaction functions for command-line interface,
 * including prompts, confirmations, and input validation.
 * 
 * @author Tom Cranstoun <ddttom@github.com>
 */

import inquirer from 'inquirer';
import { existsSync } from 'fs';
import { resolve } from 'path';

/**
 * Get user input with prompt and optional default value
 * @param {string} message - Prompt message
 * @param {string} defaultValue - Default value if user presses enter
 * @param {Function} validator - Optional validation function
 * @returns {Promise<string>} User input
 */
export async function getUserInput(message, defaultValue = '', validator = null) {
  const questions = [{
    type: 'input',
    name: 'userInput',
    message,
    default: defaultValue,
    validate: validator || (() => true)
  }];
  
  const answers = await inquirer.prompt(questions);
  return answers.userInput;
}

/**
 * Get confirmation from user (yes/no)
 * @param {string} message - Confirmation message
 * @param {boolean} defaultValue - Default value (true for yes, false for no)
 * @returns {Promise<boolean>} User confirmation
 */
export async function getConfirmation(message, defaultValue = false) {
  const questions = [{
    type: 'confirm',
    name: 'confirmed',
    message,
    default: defaultValue
  }];
  
  const answers = await inquirer.prompt(questions);
  return answers.confirmed;
}

/**
 * Get user selection from a list of choices
 * @param {string} message - Selection message
 * @param {Array} choices - Array of choice objects or strings
 * @param {string|number} defaultValue - Default selected value
 * @returns {Promise<any>} Selected choice
 */
export async function getSelection(message, choices, defaultValue = null) {
  const questions = [{
    type: 'list',
    name: 'selection',
    message,
    choices,
    default: defaultValue
  }];
  
  const answers = await inquirer.prompt(questions);
  return answers.selection;
}

/**
 * Get multiple selections from a list of choices
 * @param {string} message - Selection message
 * @param {Array} choices - Array of choice objects or strings
 * @param {Array} defaultValues - Default selected values
 * @returns {Promise<Array>} Selected choices
 */
export async function getMultipleSelections(message, choices, defaultValues = []) {
  const questions = [{
    type: 'checkbox',
    name: 'selections',
    message,
    choices,
    default: defaultValues
  }];
  
  const answers = await inquirer.prompt(questions);
  return answers.selections;
}

/**
 * Get directory path from user with validation
 * @param {string} message - Prompt message
 * @param {string} defaultPath - Default directory path
 * @returns {Promise<string>} Valid directory path
 */
export async function getDirectoryPath(message, defaultPath = '') {
  const validator = (input) => {
    if (!input.trim()) {
      return 'Directory path cannot be empty';
    }
    
    const resolvedPath = resolve(input.trim());
    
    if (!existsSync(resolvedPath)) {
      return `Directory does not exist: ${resolvedPath}`;
    }
    
    return true;
  };
  
  return await getUserInput(message, defaultPath, validator);
}

/**
 * Get file path from user with validation
 * @param {string} message - Prompt message
 * @param {string} defaultPath - Default file path
 * @param {Array} allowedExtensions - Array of allowed file extensions (optional)
 * @returns {Promise<string>} Valid file path
 */
export async function getFilePath(message, defaultPath = '', allowedExtensions = []) {
  const validator = (input) => {
    if (!input.trim()) {
      return 'File path cannot be empty';
    }
    
    const resolvedPath = resolve(input.trim());
    
    if (!existsSync(resolvedPath)) {
      return `File does not exist: ${resolvedPath}`;
    }
    
    if (allowedExtensions.length > 0) {
      const extension = resolvedPath.toLowerCase().split('.').pop();
      const normalizedExtensions = allowedExtensions.map(ext => ext.toLowerCase().replace('.', ''));
      
      if (!normalizedExtensions.includes(extension)) {
        return `File must have one of these extensions: ${allowedExtensions.join(', ')}`;
      }
    }
    
    return true;
  };
  
  return await getUserInput(message, defaultPath, validator);
}

/**
 * Get numeric input from user with validation
 * @param {string} message - Prompt message
 * @param {number} defaultValue - Default numeric value
 * @param {number} min - Minimum allowed value (optional)
 * @param {number} max - Maximum allowed value (optional)
 * @returns {Promise<number>} Valid numeric input
 */
export async function getNumericInput(message, defaultValue = 0, min = null, max = null) {
  const validator = (input) => {
    const num = parseFloat(input);
    
    if (isNaN(num)) {
      return 'Please enter a valid number';
    }
    
    if (min !== null && num < min) {
      return `Number must be at least ${min}`;
    }
    
    if (max !== null && num > max) {
      return `Number must be at most ${max}`;
    }
    
    return true;
  };
  
  const result = await getUserInput(message, defaultValue.toString(), validator);
  return parseFloat(result);
}

/**
 * Get integer input from user with validation
 * @param {string} message - Prompt message
 * @param {number} defaultValue - Default integer value
 * @param {number} min - Minimum allowed value (optional)
 * @param {number} max - Maximum allowed value (optional)
 * @returns {Promise<number>} Valid integer input
 */
export async function getIntegerInput(message, defaultValue = 0, min = null, max = null) {
  const validator = (input) => {
    const num = parseInt(input);
    
    if (isNaN(num) || !Number.isInteger(parseFloat(input))) {
      return 'Please enter a valid integer';
    }
    
    if (min !== null && num < min) {
      return `Integer must be at least ${min}`;
    }
    
    if (max !== null && num > max) {
      return `Integer must be at most ${max}`;
    }
    
    return true;
  };
  
  const result = await getUserInput(message, defaultValue.toString(), validator);
  return parseInt(result);
}

/**
 * Get email input from user with validation
 * @param {string} message - Prompt message
 * @param {string} defaultValue - Default email value
 * @returns {Promise<string>} Valid email address
 */
export async function getEmailInput(message, defaultValue = '') {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  
  const validator = (input) => {
    if (!input.trim()) {
      return 'Email address cannot be empty';
    }
    
    if (!emailRegex.test(input.trim())) {
      return 'Please enter a valid email address';
    }
    
    return true;
  };
  
  return await getUserInput(message, defaultValue, validator);
}

/**
 * Get password input from user (hidden)
 * @param {string} message - Prompt message
 * @param {number} minLength - Minimum password length
 * @returns {Promise<string>} Password input
 */
export async function getPasswordInput(message, minLength = 8) {
  const validator = (input) => {
    if (input.length < minLength) {
      return `Password must be at least ${minLength} characters long`;
    }
    
    return true;
  };
  
  const questions = [{
    type: 'password',
    name: 'password',
    message,
    mask: '*',
    validate: validator
  }];
  
  const answers = await inquirer.prompt(questions);
  return answers.password;
}

/**
 * Display a progress indicator while executing an async function
 * @param {string} message - Progress message
 * @param {Function} asyncFunction - Async function to execute
 * @param {Object} options - Progress options
 * @returns {Promise<any>} Result of async function
 */
export async function withProgress(message, asyncFunction, options = {}) {
  const { 
    successMessage = 'Completed',
    errorMessage = 'Failed',
    spinner = 'dots'
  } = options;
  
  // For now, we'll use a simple console approach
  // In a full implementation, you might use ora or similar
  console.log(`⏳ ${message}...`);
  
  try {
    const result = await asyncFunction();
    console.log(`✅ ${successMessage}`);
    return result;
  } catch (error) {
    console.log(`❌ ${errorMessage}: ${error.message}`);
    throw error;
  }
}

/**
 * Create an interactive menu
 * @param {string} title - Menu title
 * @param {Array} options - Array of menu options
 * @param {boolean} allowBack - Allow back/exit option
 * @returns {Promise<any>} Selected option
 */
export async function showMenu(title, options, allowBack = true) {
  console.log(`\n${title}\n${'='.repeat(title.length)}`);
  
  const choices = [...options];
  
  if (allowBack) {
    choices.push({
      name: 'Back/Exit',
      value: 'exit'
    });
  }
  
  return await getSelection('Select an option:', choices);
}

/**
 * Get configuration values interactively
 * @param {Object} configSchema - Configuration schema with prompts
 * @returns {Promise<Object>} Configuration object
 */
export async function getConfiguration(configSchema) {
  const config = {};
  
  console.log('\n📋 Configuration Setup\n');
  
  for (const [key, schema] of Object.entries(configSchema)) {
    const {
      message,
      type = 'input',
      default: defaultValue,
      choices,
      validate
    } = schema;
    
    let value;
    
    switch (type) {
      case 'confirm':
        value = await getConfirmation(message, defaultValue);
        break;
        
      case 'list':
        value = await getSelection(message, choices, defaultValue);
        break;
        
      case 'checkbox':
        value = await getMultipleSelections(message, choices, defaultValue);
        break;
        
      case 'number':
        value = await getNumericInput(message, defaultValue);
        break;
        
      case 'integer':
        value = await getIntegerInput(message, defaultValue);
        break;
        
      case 'directory':
        value = await getDirectoryPath(message, defaultValue);
        break;
        
      case 'file':
        value = await getFilePath(message, defaultValue, schema.extensions);
        break;
        
      case 'email':
        value = await getEmailInput(message, defaultValue);
        break;
        
      case 'password':
        value = await getPasswordInput(message, schema.minLength);
        break;
        
      default:
        value = await getUserInput(message, defaultValue, validate);
    }
    
    config[key] = value;
  }
  
  return config;
}

/**
 * Display a table of data
 * @param {Array} data - Array of objects to display
 * @param {Array} columns - Column definitions
 */
export function displayTable(data, columns) {
  if (!Array.isArray(data) || data.length === 0) {
    console.log('No data to display');
    return;
  }
  
  // Calculate column widths
  const widths = {};
  columns.forEach(col => {
    const key = col.key || col;
    const header = col.header || key;
    
    widths[key] = Math.max(
      header.length,
      ...data.map(row => String(row[key] || '').length)
    );
  });
  
  // Display header
  const headerRow = columns.map(col => {
    const key = col.key || col;
    const header = col.header || key;
    return header.padEnd(widths[key]);
  }).join(' | ');
  
  console.log(headerRow);
  console.log('-'.repeat(headerRow.length));
  
  // Display data rows
  data.forEach(row => {
    const dataRow = columns.map(col => {
      const key = col.key || col;
      const value = row[key] || '';
      const formatter = col.formatter || (v => v);
      
      return String(formatter(value)).padEnd(widths[key]);
    }).join(' | ');
    
    console.log(dataRow);
  });
}

/**
 * Pause execution and wait for user to press enter
 * @param {string} message - Message to display
 * @returns {Promise<void>}
 */
export async function pauseForUser(message = 'Press Enter to continue...') {
  await getUserInput(message, '');
}

/**
 * Clear the console screen
 */
export function clearScreen() {
  console.clear();
}

/**
 * Display a banner message
 * @param {string} message - Banner message
 * @param {string} char - Character to use for border
 */
export function displayBanner(message, char = '=') {
  const lines = message.split('\n');
  const maxLength = Math.max(...lines.map(line => line.length));
  const border = char.repeat(maxLength + 4);
  
  console.log(border);
  lines.forEach(line => {
    console.log(`${char} ${line.padEnd(maxLength)} ${char}`);
  });
  console.log(border);
}