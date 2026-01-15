/**
 * Review Patterns Library
 * Framework-specific code review patterns for intelligent code review
 *
 * These patterns guide AI agents to look for tech-stack-specific issues
 *
 * @author Avi Fenesh
 * @license MIT
 */

const reviewPatterns = {
  /**
   * React framework patterns
   */
  react: {
    hooks_rules: [
      'useEffect with missing dependencies in dependency array',
      'useState called inside loops or conditionally',
      'Hooks called conditionally (violates Rules of Hooks)',
      'useCallback without proper dependency array',
      'useMemo overused on cheap calculations',
      'useEffect cleanup function missing for subscriptions',
      'Stale closure bugs in useEffect/useCallback'
    ],
    state_management: [
      'Prop drilling deeper than 3 levels (consider Context)',
      'Redundant state that can be derived from props',
      'State updates not using functional form when depending on previous state',
      'Too many useState hooks (consider useReducer)',
      'State lifted too high in component tree',
      'Missing key prop in list rendering',
      'Mutating state directly instead of using setState'
    ],
    performance: [
      'Missing React.memo on expensive components',
      'Inline function/object props causing unnecessary re-renders',
      'Large objects/arrays in Context causing frequent re-renders',
      'Expensive calculations not wrapped in useMemo',
      'Component re-rendering too frequently (check React DevTools)',
      'Bundle size issues from importing entire libraries',
      'Lazy loading not used for code splitting'
    ],
    common_mistakes: [
      'Comparing objects/arrays in useEffect dependencies',
      'Using index as key in dynamic lists',
      'Conditional rendering with && that shows 0 instead of nothing',
      'Not handling loading and error states',
      'Forgetting to cleanup effects (memory leaks)',
      'Using findDOMNode or string refs (deprecated)'
    ]
  },

  /**
   * Vue.js framework patterns
   */
  vue: {
    reactivity: [
      'Mutating props directly instead of emitting events',
      'Not using computed properties for derived state',
      'Reactive data not declared in data() function',
      'Using wrong reactivity API (Vue 2 vs Vue 3)',
      'Missing deep watchers when needed',
      'Overusing watchers instead of computed properties'
    ],
    composition_api: [
      'Ref vs reactive usage inconsistencies',
      'Forgetting .value when accessing refs',
      'Creating refs/reactive objects outside setup()',
      'Not destructuring reactive objects properly',
      'Missing proper TypeScript types for refs'
    ],
    performance: [
      'v-for without proper key binding',
      'Using v-for and v-if on same element',
      'Not using v-once for static content',
      'Missing keep-alive for cached components',
      'Watchers running on every keystroke without debounce'
    ]
  },

  /**
   * Angular framework patterns
   */
  angular: {
    change_detection: [
      'Not using OnPush change detection strategy',
      'Calling functions in templates (runs on every change detection)',
      'Not using trackBy in ngFor for large lists',
      'Subscriptions not unsubscribed (memory leaks)',
      'Manual change detection triggers overused'
    ],
    rxjs: [
      'Not unsubscribing from observables',
      'Using subscribe() instead of async pipe in templates',
      'Not using switchMap/mergeMap/concatMap correctly',
      'Nested subscriptions (callback hell)',
      'Missing error handling in subscribe()',
      'Not using takeUntil for cleanup'
    ],
    dependency_injection: [
      'Services not marked with @Injectable()',
      'Injecting in constructors instead of using inject() function',
      'Missing providedIn metadata for tree-shaking',
      'Circular dependencies between services'
    ]
  },

  /**
   * Python/Django framework patterns
   */
  django: {
    orm: [
      'Raw SQL without parameterization (SQL injection risk)',
      'N+1 queries (missing select_related/prefetch_related)',
      'Synchronous database calls in async views',
      'Using filter().count() instead of exists()',
      'Not using bulk_create for multiple inserts',
      'Missing database indexes on frequently queried fields',
      'Using get() without DoesNotExist exception handling'
    ],
    views: [
      'Missing CSRF protection on forms',
      'Not validating form data properly',
      'Using GET requests for state-changing operations',
      'Missing permission checks on views',
      'Returning raw HTML instead of using templates',
      'Not handling common HTTP status codes properly'
    ],
    models: [
      'Missing __str__ method on models',
      'Not setting related_name on ForeignKey',
      'Mutable default arguments (default=[] or default={})',
      'Missing unique_together or Meta options',
      'Using TextField instead of CharField with max_length',
      'Missing choices for status fields'
    ],
    security: [
      'DEBUG=True in production',
      'SECRET_KEY hardcoded or in version control',
      'Missing ALLOWED_HOSTS configuration',
      'Using eval() or exec() with user input',
      'Not using Django ORM parameterization',
      'Missing rate limiting on sensitive endpoints'
    ]
  },

  /**
   * FastAPI framework patterns
   */
  fastapi: {
    async_patterns: [
      'Mixing async and sync operations incorrectly',
      'Using blocking I/O in async endpoints',
      'Not using await with async database calls',
      'Creating sync database sessions in async context',
      'Missing async database driver'
    ],
    validation: [
      'Not using Pydantic models for request validation',
      'Missing response models',
      'Not validating query parameters',
      'Returning raw dictionaries instead of models',
      'Missing field validators for complex validation'
    ],
    dependencies: [
      'Dependency injection not used for database sessions',
      'Not using Depends() for authentication',
      'Missing dependency override for testing',
      'Expensive operations in dependencies without caching'
    ]
  },

  /**
   * Rust patterns
   */
  rust: {
    safety: [
      'Unsafe blocks without clear justification comment',
      'Excessive use of unwrap() or expect() (prefer error handling)',
      'Clone used when reference borrowing would work',
      'Manual memory management when safe abstractions available',
      'Transmute usage without clear safety invariants',
      'Raw pointer dereferencing without bounds checking'
    ],
    error_handling: [
      'Using panic! in library code',
      'Not implementing Error trait for custom errors',
      'Ignoring Result types with underscore',
      'Using unwrap() in production code paths',
      'Missing ? operator for error propagation',
      'Not providing context in error messages'
    ],
    performance: [
      'Unnecessary Vec allocations (use slices or arrays)',
      'String concatenation in loops (use String::with_capacity)',
      'Missing #[inline] on small hot functions',
      'Not using iterators (manual loops)',
      'Cloning when into() would transfer ownership',
      'Not using Cow for conditional copying'
    ],
    async_rust: [
      'Blocking operations in async functions',
      'Not using tokio::spawn for CPU-intensive work',
      'Missing Send bounds on async trait methods',
      'Holding locks across await points',
      'Not using async-friendly versions of std types'
    ]
  },

  /**
   * Go patterns
   */
  go: {
    concurrency: [
      'Goroutines without context cancellation',
      'Mutex not unlocked in defer',
      'Channels not closed properly',
      'Race conditions in tests',
      'WaitGroup.Add() called in wrong goroutine',
      'Goroutine leaks (no cleanup mechanism)',
      'Using global variables in concurrent code'
    ],
    error_handling: [
      'Ignored errors (using _ for error returns)',
      'Error strings start with capital letter (go convention)',
      'Not using fmt.Errorf with %w for error wrapping',
      'Panic instead of returning error',
      'Not checking errors from Close() or Flush()',
      'Using panic/recover for control flow'
    ],
    performance: [
      'String concatenation in loops (use strings.Builder)',
      'Not reusing buffers for repeated operations',
      'Inefficient JSON marshaling in hot paths',
      'Missing connection pooling for databases',
      'Reflection used unnecessarily',
      'Not using sync.Pool for frequent allocations'
    ],
    best_practices: [
      'Not using go fmt / go vet',
      'Accepting interfaces, returning structs violation',
      'Not embedding errors context',
      'Using init() function unnecessarily',
      'Exporting more than necessary',
      'Not following effective Go guidelines'
    ]
  },

  /**
   * Express.js (Node.js) patterns
   */
  express: {
    async_handling: [
      'Async route handlers not wrapped in try-catch',
      'Not using async error handling middleware',
      'Promises not awaited properly',
      'Missing error handling in Promise chains',
      'Sync code blocking event loop'
    ],
    security: [
      'Missing helmet middleware',
      'No rate limiting on sensitive endpoints',
      'CORS configured too permissively',
      'User input not sanitized',
      'SQL queries not parameterized',
      'Passwords not hashed with bcrypt',
      'Missing HTTPS in production',
      'Exposing stack traces in production'
    ],
    middleware: [
      'Middleware order issues (e.g., body-parser position)',
      'Not calling next() in middleware',
      'Error middleware not having 4 parameters',
      'Missing catch-all error handler',
      'Middleware not handling async errors'
    ]
  }
};

// Pre-compute available frameworks Set for O(1) lookup
const _availableFrameworks = null; // Lazy initialization

/**
 * Get review patterns for a detected framework
 * @param {string} framework - Framework name
 * @returns {Object|null} Patterns for framework or null if not found
 */
function getPatternsForFramework(framework) {
  if (typeof framework !== 'string') return null;
  return reviewPatterns[framework.toLowerCase()] || null;
}

/**
 * Get all available frameworks
 * @returns {Array<string>} List of framework names
 */
function getAvailableFrameworks() {
  return Object.keys(reviewPatterns);
}

/**
 * Check if patterns exist for a framework
 * Uses cached Set for O(1) lookup performance
 * @param {string} framework - Framework name
 * @returns {boolean} True if patterns available
 */
function hasPatternsFor(framework) {
  if (typeof framework !== 'string') return false;
  return framework.toLowerCase() in reviewPatterns;
}

module.exports = {
  reviewPatterns,
  getPatternsForFramework,
  getAvailableFrameworks,
  hasPatternsFor
};
