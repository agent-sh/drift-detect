/**
 * Slop Detection Patterns
 * Pattern library for detecting and removing AI-generated code slop
 *
 * @author Avi Fenesh
 * @license MIT
 */

// Pre-compiled regex cache for performance
const _compiledExcludePatterns = new Map();

/**
 * Get a compiled regex for an exclude pattern (cached)
 * @param {string} pattern - Glob pattern to compile
 * @returns {RegExp} Compiled regex
 */
function getCompiledPattern(pattern) {
  if (!_compiledExcludePatterns.has(pattern)) {
    // Escape all regex metacharacters except *, then replace * with .*
    const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
    const regexStr = '^' + escaped.replace(/\*/g, '.*') + '$';
    _compiledExcludePatterns.set(pattern, new RegExp(regexStr));
  }
  return _compiledExcludePatterns.get(pattern);
}

/**
 * Auto-fix strategies:
 * - remove: Delete the matching line(s)
 * - replace: Replace with suggested fix
 * - add_logging: Add proper error logging
 * - flag: Mark for manual review
 * - none: Report only, no auto-fix
 */

const slopPatterns = {
  /**
   * Console debugging in JavaScript/TypeScript
   */
  console_debugging: {
    pattern: /console\.(log|debug|info|warn)\(/,
    exclude: ['*.test.*', '*.spec.*', '*.config.*'],
    severity: 'medium',
    autoFix: 'remove',
    language: 'javascript',
    description: 'Console.log statements left in production code'
  },

  /**
   * Python debugging statements
   */
  python_debugging: {
    pattern: /(print\(|import pdb|breakpoint\(\)|import ipdb)/,
    exclude: ['test_*.py', '*_test.py', 'conftest.py'],
    severity: 'medium',
    autoFix: 'remove',
    language: 'python',
    description: 'Debug print/breakpoint statements in production'
  },

  /**
   * Rust debugging macros
   */
  rust_debugging: {
    pattern: /(println!|dbg!|eprintln!)\(/,
    exclude: ['*_test.rs', '*_tests.rs'],
    severity: 'medium',
    autoFix: 'remove',
    language: 'rust',
    description: 'Debug print macros in production code'
  },

  /**
   * Old TODO comments (>90 days)
   */
  old_todos: {
    pattern: /(TODO|FIXME|HACK|XXX):/,
    exclude: [],
    severity: 'low',
    autoFix: 'flag',
    language: null, // All languages
    description: 'TODO/FIXME comments older than 90 days',
    requiresAgeCheck: true,
    ageThreshold: 90 // days
  },

  /**
   * Commented out code blocks
   */
  commented_code: {
    pattern: /^\s*(\/\/|#)\s*\w{5,}/,
    exclude: [],
    severity: 'medium',
    autoFix: 'remove',
    language: null,
    description: 'Large blocks of commented-out code',
    minConsecutiveLines: 5
  },

  /**
   * Placeholder text
   */
  placeholder_text: {
    pattern: /(lorem ipsum|test test test|asdf|foo bar baz|placeholder|replace this|todo: implement)/i,
    exclude: ['*.test.*', '*.spec.*', 'README.*', '*.md'],
    severity: 'high',
    autoFix: 'flag',
    language: null,
    description: 'Placeholder text that should be replaced'
  },

  /**
   * Empty catch blocks (JavaScript/TypeScript)
   */
  empty_catch_js: {
    pattern: /catch\s*\([^)]*\)\s*\{\s*\}/,
    exclude: [],
    severity: 'high',
    autoFix: 'add_logging',
    language: 'javascript',
    description: 'Empty catch blocks without error handling'
  },

  /**
   * Empty except blocks (Python)
   */
  empty_except_py: {
    pattern: /except\s*[^:]*:\s*pass\s*$/,
    exclude: [],
    severity: 'high',
    autoFix: 'add_logging',
    language: 'python',
    description: 'Empty except blocks with just pass'
  },

  /**
   * Magic numbers (large hardcoded numbers)
   */
  magic_numbers: {
    pattern: /(?<![a-zA-Z_\d])[0-9]{4,}(?![a-zA-Z_\d])/,
    exclude: ['*.test.*', '*.spec.*', '*.config.*', 'package.json', 'package-lock.json'],
    severity: 'low',
    autoFix: 'flag',
    language: null,
    description: 'Magic numbers that should be constants'
  },

  /**
   * Disabled linter rules
   */
  disabled_linter: {
    pattern: /(eslint-disable|pylint: disable|#\s*noqa|@SuppressWarnings|#\[allow\()/,
    exclude: [],
    severity: 'medium',
    autoFix: 'flag',
    language: null,
    description: 'Disabled linter rules that may hide issues'
  },

  /**
   * Unused imports (basic pattern, language-specific tools better)
   */
  unused_imports_hint: {
    pattern: /^import .* from .* \/\/ unused$/,
    exclude: [],
    severity: 'low',
    autoFix: 'remove',
    language: null,
    description: 'Imports marked as unused'
  },

  /**
   * Duplicate string literals (same string >5 times)
   */
  duplicate_strings: {
    pattern: null, // Requires multi-pass analysis
    exclude: ['*.test.*', '*.spec.*'],
    severity: 'low',
    autoFix: 'flag',
    language: null,
    description: 'Duplicate string literals that should be constants',
    requiresMultiPass: true
  },

  /**
   * Inconsistent indentation markers
   */
  mixed_indentation: {
    pattern: /^\t+ +|^ +\t+/,
    exclude: ['Makefile', '*.mk'],
    severity: 'low',
    autoFix: 'replace',
    language: null,
    description: 'Mixed tabs and spaces'
  },

  /**
   * Trailing whitespace
   */
  trailing_whitespace: {
    pattern: /\s+$/,
    exclude: ['*.md'], // Markdown uses trailing spaces for line breaks
    severity: 'low',
    autoFix: 'remove',
    language: null,
    description: 'Trailing whitespace at end of lines'
  },

  /**
   * Multiple consecutive blank lines
   */
  multiple_blank_lines: {
    pattern: /^\s*\n\s*\n\s*\n/,
    exclude: [],
    severity: 'low',
    autoFix: 'replace',
    language: null,
    description: 'More than 2 consecutive blank lines'
  },

  /**
   * Hardcoded credentials patterns
   */
  hardcoded_secrets: {
    pattern: /(password|secret|api[_-]?key|token)\s*=\s*["'][^"']{8,}["']/i,
    exclude: ['*.test.*', '*.example.*', 'README.*'],
    severity: 'critical',
    autoFix: 'flag',
    language: null,
    description: 'Potential hardcoded credentials'
  },

  /**
   * Process.exit in libraries
   */
  process_exit: {
    pattern: /process\.exit\(/,
    exclude: ['*.test.*', 'cli.js', 'index.js', 'bin/*'],
    severity: 'high',
    autoFix: 'flag',
    language: 'javascript',
    description: 'process.exit() should not be in library code'
  },

  /**
   * Bare URLs in code (should use constants)
   */
  bare_urls: {
    pattern: /https?:\/\/[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/,
    exclude: ['*.test.*', '*.md', 'package.json', 'README.*'],
    severity: 'low',
    autoFix: 'flag',
    language: null,
    description: 'Hardcoded URLs that should be configuration'
  }
};

/**
 * Get patterns for a specific language
 * @param {string} language - Language identifier ('javascript', 'python', 'rust', etc.)
 * @returns {Object} Filtered patterns
 */
function getPatternsForLanguage(language) {
  const filtered = {};
  for (const [name, pattern] of Object.entries(slopPatterns)) {
    if (!pattern.language || pattern.language === language) {
      filtered[name] = pattern;
    }
  }
  return filtered;
}

/**
 * Get patterns by severity
 * @param {string} severity - Severity level ('critical', 'high', 'medium', 'low')
 * @returns {Object} Filtered patterns
 */
function getPatternsBySeverity(severity) {
  const filtered = {};
  for (const [name, pattern] of Object.entries(slopPatterns)) {
    if (pattern.severity === severity) {
      filtered[name] = pattern;
    }
  }
  return filtered;
}

/**
 * Check if a file should be excluded based on pattern rules
 * Uses pre-compiled regex cache for performance
 * @param {string} filePath - File path to check
 * @param {Array<string>} excludePatterns - Exclude patterns
 * @returns {boolean} True if file should be excluded
 */
function isFileExcluded(filePath, excludePatterns) {
  if (!excludePatterns || excludePatterns.length === 0) return false;

  return excludePatterns.some(pattern => {
    const regex = getCompiledPattern(pattern);
    return regex.test(filePath);
  });
}

module.exports = {
  slopPatterns,
  getPatternsForLanguage,
  getPatternsBySeverity,
  isFileExcluded
};
