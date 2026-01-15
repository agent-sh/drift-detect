---
description: Intelligent PR merge with validation and deployment testing
argument-hint: "[pr-number] [--strategy STRATEGY] [--skip-validation] [--dry-run]"
---

# /pr-merge - Intelligent PR Merge

Comprehensive PR merge procedure with review comment handling, quality validation, and deployment testing.

Simplified from project-specific versions, fully generic and auto-adaptive.

## Arguments

Parse from $ARGUMENTS:
- **PR Number**: PR number to merge (optional, auto-detect from branch)
- **--strategy**: Merge strategy: `squash` (default) | `merge` | `rebase`
- **--skip-validation**: Skip deployment validation (dangerous, not recommended)
- **--dry-run**: Show what would happen without executing

## Pre-Context: Platform Detection

```bash
# Detect platform and project configuration
PLATFORM=$(node ${CLAUDE_PLUGIN_ROOT}/lib/platform/detect-platform.js)
TOOLS=$(node ${CLAUDE_PLUGIN_ROOT}/lib/platform/verify-tools.js)

# Extract configuration
BRANCH_STRATEGY=$(echo $PLATFORM | jq -r '.branchStrategy')
MAIN_BRANCH=$(echo $PLATFORM | jq -r '.mainBranch')
DEPLOYMENT=$(echo $PLATFORM | jq -r '.deployment')
CI_PLATFORM=$(echo $PLATFORM | jq -r '.ci')

# Check required tools
GH_AVAILABLE=$(echo $TOOLS | jq -r '.gh.available')
if [ "$GH_AVAILABLE" != "true" ]; then
  echo "ERROR: GitHub CLI (gh) required"
  exit 1
fi

# Determine workflow
if [ "$BRANCH_STRATEGY" = "multi-branch" ]; then
  WORKFLOW="dev-prod"
  PROD_BRANCH="stable"
  echo "Multi-branch workflow: $MAIN_BRANCH → $PROD_BRANCH"
else
  WORKFLOW="single-branch"
  echo "Single-branch workflow: $MAIN_BRANCH only"
fi
```

## Phase 1: PR Identification

### Auto-Detect or Use Provided PR

```bash
# If PR number provided in arguments
if [ -n "$PR_ARG" ]; then
  PR_NUMBER="$PR_ARG"
  echo "Using provided PR: #$PR_NUMBER"

# Else try to detect from current branch
elif CURRENT_BRANCH=$(git branch --show-current 2>/dev/null); then
  PR_NUMBER=$(gh pr view --json number --jq '.number' 2>/dev/null)

  if [ -n "$PR_NUMBER" ]; then
    echo "Detected PR from current branch: #$PR_NUMBER"
  else
    echo "No PR found for branch $CURRENT_BRANCH"
    NEEDS_SELECTION="true"
  fi

# Else show interactive selection
else
  NEEDS_SELECTION="true"
fi

# Interactive selection if needed
if [ "$NEEDS_SELECTION" = "true" ]; then
  echo "Select a PR to merge:"
  gh pr list --json number,title,author,updatedAt --jq '.[] | "#\(.number) - \(.title) (by @\(.author.login))"'

  read -p "Enter PR number: " PR_NUMBER

  if [ -z "$PR_NUMBER" ]; then
    echo "ERROR: No PR selected"
    exit 1
  fi
fi
```

### Load PR Details

```bash
# Fetch comprehensive PR information
PR_DATA=$(gh pr view $PR_NUMBER --json number,title,state,body,files,reviews,comments,commits,headRefName,baseRefName,mergeable,mergeStateStatus)

# Extract key fields
PR_TITLE=$(echo $PR_DATA | jq -r '.title')
PR_STATE=$(echo $PR_DATA | jq -r '.state')
PR_HEAD=$(echo $PR_DATA | jq -r '.headRefName')
PR_BASE=$(echo $PR_DATA | jq -r '.baseRefName')
PR_MERGEABLE=$(echo $PR_DATA | jq -r '.mergeable')
PR_FILES=$(echo $PR_DATA | jq -r '.files | length')

echo "PR #$PR_NUMBER: $PR_TITLE"
echo "Branch: $PR_HEAD → $PR_BASE"
echo "Files changed: $PR_FILES"
echo "Mergeable: $PR_MERGEABLE"

# Verify PR is open
if [ "$PR_STATE" != "OPEN" ]; then
  echo "ERROR: PR #$PR_NUMBER is $PR_STATE, not OPEN"
  exit 1
fi

# Verify targeting correct base
if [ "$PR_BASE" != "$MAIN_BRANCH" ]; then
  echo "WARNING: PR targets $PR_BASE, expected $MAIN_BRANCH"
  read -p "Continue anyway? (y/N): " CONFIRM
  if [ "$CONFIRM" != "y" ]; then
    exit 1
  fi
fi
```

### Dry Run Mode

If `--dry-run` provided:

```markdown
## Dry Run: PR Merge Plan

**PR**: #${PR_NUMBER} - ${PR_TITLE}
**Branch**: ${PR_HEAD} → ${PR_BASE}
**Strategy**: ${STRATEGY:-squash}
**Workflow**: ${WORKFLOW}

**Phases**:
1. ✓ PR Identification (complete)
2. → Address review comments
3. → Subagent quality validation
4. → Trigger CI + await success
5. → Merge to ${MAIN_BRANCH}
${WORKFLOW === 'dev-prod' ? '6. → Test development environment\n7. → Merge to production\n8. → Cleanup' : '6. → Cleanup'}
9. → Completion summary

No changes will be made in dry-run mode.
```
Exit after showing plan.

## Phase 2: Address Review Comments

### Fetch Review Comments

```bash
# Get all reviews and comments
REVIEWS=$(echo $PR_DATA | jq -r '.reviews')
COMMENTS=$(echo $PR_DATA | jq -r '.comments')

# Categorize reviews
APPROVED=$(echo $REVIEWS | jq '[.[] | select(.state=="APPROVED")] | length')
CHANGES_REQUESTED=$(echo $REVIEWS | jq '[.[] | select(.state=="CHANGES_REQUESTED")] | length')
COMMENTED=$(echo $REVIEWS | jq '[.[] | select(.state=="COMMENTED")] | length')

echo "Review status:"
echo "  Approved: $APPROVED"
echo "  Changes requested: $CHANGES_REQUESTED"
echo "  Comments: $COMMENTED"
```

### Handle Blockers

If `CHANGES_REQUESTED > 0`:

```bash
echo "⚠ Changes requested - addressing blockers..."

# Extract blocker comments
BLOCKER_COMMENTS=$(echo $REVIEWS | jq -r '.[] | select(.state=="CHANGES_REQUESTED") | .body')

# Display blockers
echo "Blockers to address:"
echo "$BLOCKER_COMMENTS"

# For each blocker, analyze and implement fix
while IFS= read -r BLOCKER; do
  echo "Addressing blocker: $BLOCKER"

  # Use AI to implement fix
  # This is an AI agent task
  implement_fix_for_blocker "$BLOCKER"

done <<< "$BLOCKER_COMMENTS"

# Commit fixes
git add .
git commit -m "fix: address review feedback"
git push

# Wait for re-review
echo "Pushed fixes. Waiting for re-approval..."
sleep 30

# Re-fetch reviews
REVIEWS=$(gh pr view $PR_NUMBER --json reviews --jq '.reviews')
CHANGES_REQUESTED=$(echo $REVIEWS | jq '[.[] | select(.state=="CHANGES_REQUESTED")] | length')

if [ "$CHANGES_REQUESTED" -gt 0 ]; then
  echo "⚠ Still have changes requested after fixes"
  echo "Manual review may be needed"
  read -p "Continue anyway? (y/N): " CONFIRM
  if [ "$CONFIRM" != "y" ]; then
    exit 1
  fi
fi
```

### Handle Questions

```bash
# Extract comment threads with questions
QUESTIONS=$(echo $COMMENTS | jq -r '.[] | select(.body | test("\\?\\s*$")) | .body')

if [ -n "$QUESTIONS" ]; then
  echo "Questions from reviewers:"
  echo "$QUESTIONS"
  echo ""
  echo "Respond to questions in GitHub before proceeding"
  read -p "Press Enter when questions are answered..."
fi
```

### Categorize Suggestions

```bash
# Non-blocking suggestions can be noted for future work
SUGGESTIONS=$(echo $COMMENTS | jq -r '.[] | select(.body | test("(?i)(consider|suggestion|nit|nitpick|optional)")) | .body')

if [ -n "$SUGGESTIONS" ]; then
  echo "Reviewer suggestions (non-blocking):"
  echo "$SUGGESTIONS"
  echo ""
  echo "Consider addressing these suggestions or noting them for future work"
fi
```

## Phase 3: Subagent Quality Validation

Launch specialized validation agents:

### Code Quality Agent

```javascript
const codeQualityResult = Task({
  subagent_type: "pr-review-toolkit:code-reviewer",
  prompt: `Review PR #${PR_NUMBER} for code quality issues.

Focus on:
- Code style consistency
- Best practices adherence
- Potential bugs
- Maintainability

Provide evidence-based findings with file:line references.
Only report critical and high-severity issues.

PR: ${PR_NUMBER}`
});
```

### Security Agent

```javascript
const securityResult = Task({
  subagent_type: "pr-review-toolkit:code-reviewer",
  prompt: `Security review for PR #${PR_NUMBER}.

Check for:
- SQL injection vulnerabilities
- XSS vulnerabilities
- Authentication/authorization issues
- Secrets in code
- Unsafe dependencies

Provide evidence-based findings.
Only report critical and high-severity issues.

PR: ${PR_NUMBER}`
});
```

### Test Coverage Agent

```javascript
const testResult = Task({
  subagent_type: "pr-review-toolkit:pr-test-analyzer",
  prompt: `Analyze test coverage for PR #${PR_NUMBER}.

Verify:
- New code has tests
- Edge cases covered
- Test quality (assertions, mocking)
- Integration tests if needed

Provide specific gaps with file:line references.

PR: ${PR_NUMBER}`
});
```

### Aggregate Results

After all agents complete:

```markdown
## Quality Validation Results

**Code Quality**: ${codeQualityResult.status}
- Critical issues: ${codeQualityResult.critical}
- High priority: ${codeQualityResult.high}

**Security**: ${securityResult.status}
- Vulnerabilities: ${securityResult.vulnerabilities}
- Risks: ${securityResult.risks}

**Test Coverage**: ${testResult.status}
- Coverage: ${testResult.coverage}%
- Critical gaps: ${testResult.gaps}
```

### Iterate Until Pass

```javascript
let validationIteration = 1;
const MAX_ITERATIONS = 3;

while (validationIteration <= MAX_ITERATIONS) {
  const results = await runValidationAgents();

  const criticalIssues = [
    ...results.codeQuality.critical,
    ...results.security.critical,
    ...results.testCoverage.critical
  ];

  if (criticalIssues.length === 0) {
    console.log("✓ Quality validation passed");
    break;
  }

  console.log(`Validation iteration ${validationIteration}: ${criticalIssues.length} critical issues`);

  // Fix issues
  for (const issue of criticalIssues) {
    await implementFix(issue);
  }

  // Commit and push
  execSync('git add .');
  execSync(`git commit -m "fix: address validation feedback (iteration ${validationIteration})"`);
  execSync('git push');

  validationIteration++;
}

if (criticalIssues.length > 0) {
  console.log(`✗ Failed to pass validation after ${MAX_ITERATIONS} iterations`);
  console.log("Manual intervention required");
  exit(1);
}
```

### Approval Gate

```markdown
## ✓ Quality Gate Passed

All validation agents approved:
- Code quality: ✓ No critical issues
- Security: ✓ No vulnerabilities
- Test coverage: ✓ Adequate

Proceeding to merge...
```

## Phase 4: Trigger CI + Await Success

Platform-adaptive CI monitoring:

### GitHub Actions

```bash
if [ "$CI_PLATFORM" = "github-actions" ]; then
  echo "Waiting for GitHub Actions CI..."

  # Check PR checks status
  gh pr checks $PR_NUMBER --watch --interval 30

  CI_STATUS=$?

  if [ $CI_STATUS -eq 0 ]; then
    echo "✓ CI checks passed"
  else
    echo "✗ CI checks failed"
    gh pr checks $PR_NUMBER
    exit 1
  fi
fi
```

### GitLab CI

```bash
if [ "$CI_PLATFORM" = "gitlab-ci" ]; then
  echo "Waiting for GitLab CI..."

  # Create secure temp config file for curl (avoids token in process list)
  CURL_CONFIG=$(mktemp)
  chmod 600 "$CURL_CONFIG"
  echo "header = \"PRIVATE-TOKEN: $GITLAB_TOKEN\"" > "$CURL_CONFIG"
  
  # Cleanup function to remove config file
  cleanup_curl_config() {
    rm -f "$CURL_CONFIG"
  }
  trap cleanup_curl_config EXIT

  # Poll pipeline status
  while true; do
    PIPELINE_STATUS=$(curl -s -K "$CURL_CONFIG" \
      "https://gitlab.com/api/v4/projects/$PROJECT_ID/merge_requests/$PR_NUMBER/pipelines" \
      | jq -r '.[0].status')

    if [ "$PIPELINE_STATUS" = "success" ]; then
      echo "✓ CI passed"
      cleanup_curl_config
      break
    elif [ "$PIPELINE_STATUS" = "failed" ]; then
      echo "✗ CI failed"
      cleanup_curl_config
      exit 1
    fi

    sleep 15
  done
fi
```

### Generic CI Monitoring

```bash
if [ -z "$CI_PLATFORM" ] || [ "$CI_PLATFORM" = "null" ]; then
  echo "No CI platform detected, checking PR merge status..."

  # Verify PR is in mergeable state
  MERGE_STATE=$(gh pr view $PR_NUMBER --json mergeStateStatus --jq '.mergeStateStatus')

  if [ "$MERGE_STATE" = "CLEAN" ] || [ "$MERGE_STATE" = "HAS_HOOKS" ]; then
    echo "✓ PR is mergeable"
  else
    echo "✗ PR merge state: $MERGE_STATE"
    echo "Resolve issues before merging"
    exit 1
  fi
fi
```

## Phase 5: Merge to Main

### Verify Merge Requirements

```bash
# Final check before merge
MERGEABLE=$(gh pr view $PR_NUMBER --json mergeable --jq '.mergeable')

if [ "$MERGEABLE" != "MERGEABLE" ]; then
  echo "✗ PR is not mergeable"
  gh pr view $PR_NUMBER
  exit 1
fi

# Check for required reviews
REQUIRED_REVIEWS=$(gh repo view --json reviewDecisionNote --jq '.reviewDecisionNote')
if [ "$REQUIRED_REVIEWS" = "REVIEW_REQUIRED" ]; then
  echo "⚠ Reviews are required but not provided"
  read -p "Merge anyway? (y/N): " CONFIRM
  if [ "$CONFIRM" != "y" ]; then
    exit 1
  fi
fi
```

### Determine Merge Strategy

```bash
# Use provided strategy or default to squash
STRATEGY=${STRATEGY:-squash}

echo "Merging PR #$PR_NUMBER with strategy: $STRATEGY"
```

### Execute Merge

```bash
# Merge based on strategy
if [ "$STRATEGY" = "squash" ]; then
  gh pr merge $PR_NUMBER --squash --delete-branch
elif [ "$STRATEGY" = "merge" ]; then
  gh pr merge $PR_NUMBER --merge --delete-branch
elif [ "$STRATEGY" = "rebase" ]; then
  gh pr merge $PR_NUMBER --rebase --delete-branch
fi

MERGE_EXIT=$?

if [ $MERGE_EXIT -eq 0 ]; then
  echo "✓ Merged PR #$PR_NUMBER to $MAIN_BRANCH"
else
  echo "✗ Merge failed"
  exit 1
fi
```

### Verify Merge State

```bash
# Verify PR is now merged
PR_STATE=$(gh pr view $PR_NUMBER --json state --jq '.state')

if [ "$PR_STATE" = "MERGED" ]; then
  echo "✓ PR state confirmed: MERGED"
else
  echo "⚠ Unexpected PR state: $PR_STATE"
fi

# Fetch latest main
git checkout $MAIN_BRANCH
git pull origin $MAIN_BRANCH

MERGE_SHA=$(git rev-parse HEAD)
echo "✓ Main branch at: $MERGE_SHA"
```

## Phase 6: Test Development Environment (Conditional)

**Skip if `WORKFLOW="single-branch"` or `--skip-validation` provided**

### Wait for Development Deployment

Platform-specific deployment monitoring:

#### Railway

```bash
if [ "$DEPLOYMENT" = "railway" ]; then
  echo "Waiting for Railway development deployment..."

  SERVICE=$(railway service list --json | jq -r '.[0].name')
  DEPLOYMENT_ID=$(railway deployment list --service $SERVICE --json | jq -r '.[0].id')

  while true; do
    STATUS=$(railway deployment get $DEPLOYMENT_ID --json | jq -r '.status')

    if [ "$STATUS" = "SUCCESS" ]; then
      DEV_URL=$(railway domain list --service $SERVICE --json | jq -r '.[0].domain')
      echo "✓ Development deployed: https://$DEV_URL"
      break
    elif [ "$STATUS" = "FAILED" ]; then
      echo "✗ Development deployment failed"
      railway logs --deployment $DEPLOYMENT_ID
      echo "Fix deployment issues before proceeding"
      exit 1
    fi

    sleep 15
  done
fi
```

#### Vercel

```bash
if [ "$DEPLOYMENT" = "vercel" ]; then
  echo "Waiting for Vercel development deployment..."

  # Wait for deployment to appear
  sleep 30

  DEPLOY_URL=$(vercel ls --json | jq -r '.[0].url')

  while true; do
    STATUS=$(vercel inspect $DEPLOY_URL --json | jq -r '.readyState')

    if [ "$STATUS" = "READY" ]; then
      DEV_URL="https://$DEPLOY_URL"
      echo "✓ Development deployed: $DEV_URL"
      break
    elif [ "$STATUS" = "ERROR" ]; then
      echo "✗ Development deployment failed"
      vercel logs $DEPLOY_URL
      exit 1
    fi

    sleep 10
  done
fi
```

#### Netlify

```bash
if [ "$DEPLOYMENT" = "netlify" ]; then
  echo "Waiting for Netlify development deployment..."

  SITE_ID=$(netlify status --json | jq -r '.site_id')

  # Wait for new deployment
  sleep 30

  DEPLOY_ID=$(netlify api listSiteDeploys --data "{ \"site_id\": \"$SITE_ID\" }" | jq -r '.[0].id')

  while true; do
    STATUS=$(netlify api getDeploy --data "{ \"deploy_id\": \"$DEPLOY_ID\" }" | jq -r '.state')

    if [ "$STATUS" = "ready" ]; then
      DEV_URL=$(netlify api getDeploy --data "{ \"deploy_id\": \"$DEPLOY_ID\" }" | jq -r '.deploy_ssl_url')
      echo "✓ Development deployed: $DEV_URL"
      break
    elif [ "$STATUS" = "error" ]; then
      echo "✗ Development deployment failed"
      exit 1
    fi

    sleep 10
  done
fi
```

### Validate Development

```bash
if [ "$SKIP_VALIDATION" != "true" ]; then
  echo "Validating development deployment..."

  # Wait for stabilization
  sleep 30

  # Health check
  HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" $DEV_URL/health || echo "000")

  if [ "$HTTP_STATUS" = "200" ] || [ "$HTTP_STATUS" = "301" ] || [ "$HTTP_STATUS" = "302" ]; then
    echo "✓ Development health check: $HTTP_STATUS"
  else
    echo "✗ Development health check failed: $HTTP_STATUS"
    echo "Do NOT proceed to production"
    exit 1
  fi

  # Check error logs
  if [ "$DEPLOYMENT" = "railway" ]; then
    ERROR_COUNT=$(railway logs --tail 50 | grep -iE "(error|exception|fatal)" | wc -l)
  elif [ "$DEPLOYMENT" = "vercel" ]; then
    ERROR_COUNT=$(vercel logs $DEV_URL --since 5m | grep -iE "(error|exception|fatal)" | wc -l)
  elif [ "$DEPLOYMENT" = "netlify" ]; then
    ERROR_COUNT=$(netlify logs --since 5m | grep -iE "(error|exception|fatal)" | wc -l)
  else
    ERROR_COUNT=0
  fi

  if [ "$ERROR_COUNT" -gt 15 ]; then
    echo "✗ High error rate: $ERROR_COUNT errors"
    echo "Do NOT proceed to production"
    exit 1
  else
    echo "✓ Error rate acceptable: $ERROR_COUNT errors"
  fi

  echo "✓ Development validation passed"
else
  echo "⚠ Skipping development validation (--skip-validation)"
fi
```

## Phase 7: Merge to Production (Conditional)

**Skip if `WORKFLOW="single-branch"`**

### Merge Main to Production Branch

```bash
echo "Merging $MAIN_BRANCH → $PROD_BRANCH..."

# Checkout production
git checkout $PROD_BRANCH
git pull origin $PROD_BRANCH

# Merge main
git merge $MAIN_BRANCH --no-edit

if [ $? -ne 0 ]; then
  echo "✗ Merge to production failed"
  git merge --abort
  exit 1
fi

# Push to production
git push origin $PROD_BRANCH

if [ $? -eq 0 ]; then
  PROD_SHA=$(git rev-parse HEAD)
  echo "✓ Production at: $PROD_SHA"
else
  echo "✗ Push to production failed"
  exit 1
fi
```

### Wait for Production Deployment

```bash
echo "Waiting for production deployment..."

# Platform-specific deployment monitoring
# (Similar logic to Phase 6 but for production environment)

if [ "$DEPLOYMENT" = "railway" ]; then
  # Monitor production service
  # ...
elif [ "$DEPLOYMENT" = "vercel" ]; then
  # Monitor production deployment
  # ...
fi

echo "✓ Production deployed: $PROD_URL"
```

### Validate Production

```bash
if [ "$SKIP_VALIDATION" != "true" ]; then
  echo "Validating production..."

  # Wait longer for production
  sleep 60

  # Health check
  HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" $PROD_URL/health || echo "000")

  if [ "$HTTP_STATUS" = "200" ] || [ "$HTTP_STATUS" = "301" ] || [ "$HTTP_STATUS" = "302" ]; then
    echo "✓ Production health check: $HTTP_STATUS"
  else
    echo "✗ CRITICAL: Production health check failed: $HTTP_STATUS"
    echo "INITIATING ROLLBACK"

    # Rollback
    git reset --hard HEAD~1
    git push --force origin $PROD_BRANCH

    echo "Rolled back production"
    exit 1
  fi

  # Monitor errors
  ERROR_COUNT=0
  if [ "$DEPLOYMENT" = "railway" ]; then
    ERROR_COUNT=$(railway logs --tail 100 | grep -iE "(error|exception|fatal)" | wc -l)
  fi

  if [ "$ERROR_COUNT" -gt 25 ]; then
    echo "✗ CRITICAL: High error rate: $ERROR_COUNT"
    echo "INITIATING ROLLBACK"

    git reset --hard HEAD~1
    git push --force origin $PROD_BRANCH

    exit 1
  fi

  echo "✓ Production validation passed"
else
  echo "⚠ Skipping production validation (--skip-validation)"
fi
```

## Phase 8: Cleanup

### Worktree Cleanup

```bash
# Remove worktrees if any
WORKTREE_COUNT=$(git worktree list | wc -l)

if [ "$WORKTREE_COUNT" -gt 1 ]; then
  echo "Cleaning up worktrees..."

  git worktree list | tail -n +2 | awk '{print $1}' | while read -r wt; do
    git worktree remove $wt --force 2>/dev/null || true
  done

  echo "✓ Worktrees cleaned"
fi
```

### PLAN.md Update (Optional)

```bash
# Update PLAN.md if exists
if [ -f "PLAN.md" ]; then
  echo "PLAN.md detected"
  echo "Consider updating PLAN.md to mark completed tasks from PR #$PR_NUMBER"
fi
```

### Branch Cleanup

```bash
# Feature branch already deleted by gh pr merge --delete-branch
echo "✓ Feature branch deleted"

# Clean up local branches
git checkout $MAIN_BRANCH
git branch -d $PR_HEAD 2>/dev/null || true
```

### Post-Merge Comment

```bash
# Add deployment info to PR
gh pr comment $PR_NUMBER --body "$(cat <<EOF
## ✓ Merged and Deployed

${WORKFLOW === 'dev-prod' ? "**Development**: $DEV_URL\n**Production**: $PROD_URL" : "**Deployed**: Merged to $MAIN_BRANCH"}

**Validation**: All checks passed
**Status**: Live in production
EOF
)"

echo "✓ Added deployment comment to PR"
```

## Phase 9: Completion Summary

```markdown
# ✓ PR Merge Complete

## Pull Request
**Number**: #${PR_NUMBER}
**Title**: ${PR_TITLE}
**Branch**: ${PR_HEAD} → ${PR_BASE}
**Strategy**: ${STRATEGY}
**Status**: MERGED

## Review & Validation
- Review comments: ✓ Addressed
- Code quality: ✓ Passed
- Security: ✓ Passed
- Test coverage: ✓ Passed
- CI checks: ✓ Passed

## Deployments

${WORKFLOW === 'dev-prod' ? `
### Development
**URL**: ${DEV_URL}
**Validation**: ✓ Passed

### Production
**URL**: ${PROD_URL}
**Validation**: ✓ Passed
` : `
### Production
**Branch**: ${MAIN_BRANCH}
**Commit**: ${MERGE_SHA}
`}

## Files Changed
${PR_FILES} files modified

## Commits Merged
$(gh pr view $PR_NUMBER --json commits --jq '.commits | length') commits

---

✓ PR successfully merged and deployed!
```

## Error Handling

### PR Not Found

```markdown
ERROR: PR #${PR_NUMBER} not found

Check PR number:
  gh pr list

Or specify PR number:
  /pr-merge 123
```

### PR Already Merged

```markdown
ERROR: PR #${PR_NUMBER} is already ${PR_STATE}

View PR:
  gh pr view ${PR_NUMBER}
```

### Merge Conflicts

```markdown
✗ Cannot merge: conflicts detected

Resolve conflicts:
  gh pr checkout ${PR_NUMBER}
  git merge ${MAIN_BRANCH}
  # Resolve conflicts
  git add .
  git commit
  git push

Then retry:
  /pr-merge ${PR_NUMBER}
```

### CI Failures

```markdown
✗ CI checks failed

View failed checks:
  gh pr checks ${PR_NUMBER}

Fix issues and retry:
  /pr-merge ${PR_NUMBER}
```

### Deployment Failure

```markdown
✗ ${WORKFLOW === 'dev-prod' ? 'Development' : 'Production'} deployment failed

Check logs:
  ${DEPLOYMENT === 'railway' ? 'railway logs' : ''}
  ${DEPLOYMENT === 'vercel' ? 'vercel logs' : ''}

Once fixed, retry:
  /pr-merge ${PR_NUMBER}
```

### Validation Failure

```markdown
✗ Validation failed: ${VALIDATION_ERROR}

${WORKFLOW === 'dev-prod' && 'Development validation failed - NOT proceeding to production'}

Review issues and fix before retrying.
```

## Important Notes

- Uses platform detection from `lib/platform/detect-platform.js`
- Uses tool verification from `lib/platform/verify-tools.js`
- Requires GitHub CLI (gh)
- Auto-adapts to single-branch or multi-branch workflow
- Subagent validation with iteration
- Platform-specific deployment monitoring
- Automatic rollback on production failure
- Graceful degradation without deployment platform

## Success Criteria

- ✅ Auto-detects PR from branch or allows selection
- ✅ Addresses review comments
- ✅ Subagent validation (code quality, security, tests)
- ✅ Platform-adaptive CI monitoring
- ✅ Conditional development + production workflow
- ✅ Deployment validation with rollback
- ✅ Graceful degradation

Begin Phase 1 now.
