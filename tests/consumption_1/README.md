# Complete Course Consumption Flow - consumption_1

This directory contains a single comprehensive test file (`complete_flow.spec.ts`) that handles the entire user journey from login to course completion in one seamless flow.

## Test Overview

The `complete_flow.spec.ts` file consolidates all these steps:

1. **🔐 Login & Authentication** - Handles Keycloak login flow
2. **🎯 Onboarding** - Manages welcome modal and role selection
3. **📚 Course Discovery** - Navigates to courses and finds available content
4. **📖 Course Joining** - Joins a course and handles consent forms
5. **🎓 Course Completion** - Consumes all course content
6. **🏆 Verification** - Verifies completion status

## Key Features

### Self-Contained
- All helper functions are included in the same file
- No external dependencies on other helper files
- Standalone execution capability

### Comprehensive Error Handling
- Server error detection and automatic recovery
- Network timeout management
- UI element waiting with robust fallbacks
- Screenshot capture for debugging

### Smart Content Consumption
- Automatically detects different content types (videos, PDFs, text)
- Handles video playbook simulation
- Manages document reading simulation
- Marks content as complete appropriately

### Autonomous UI Management
- Auto-dismisses popups, modals, and notifications
- Handles cookie banners and privacy notices
- Manages onboarding flows automatically

### Intelligent Navigation
- **Course Completion Handling**: When a course is 100% completed, directly navigates to the proper course search page (`https://sandbox.sunbirded.org/resources?board=CBSE&medium=English&gradeLevel=Class%201&subject=English&id=NCF&selectedTab=course`) instead of the homepage
- **Fallback Navigation**: Uses back button approach if direct navigation fails
- **Smart Course Selection**: Automatically finds and selects incomplete courses for testing

## Usage

### Run the Test
```bash
# From the project root
npx playwright test tests/consumption_1/complete_flow.spec.ts

# With debug mode
npx playwright test tests/consumption_1/complete_flow.spec.ts --debug

# With UI mode
npx playwright test tests/consumption_1/complete_flow.spec.ts --ui

# With headed browser (visible)
npx playwright test tests/consumption_1/complete_flow.spec.ts --headed
```

### Run with Custom Configuration
```bash
# Run on specific browser
npx playwright test tests/consumption_1/complete_flow.spec.ts --project=chromium

# Run with video recording
npx playwright test tests/consumption_1/complete_flow.spec.ts --video=on

# Run with trace
npx playwright test tests/consumption_1/complete_flow.spec.ts --trace=on
```

## Configuration

### Test Timeout
- **Duration**: 20 minutes (1,200,000ms)
- **Reasoning**: Accommodates full flow including login, onboarding, course discovery, content consumption, and completion

### Credentials
- **Username**: `user2@yopmail.com`
- **Password**: `User2@123`
- Update these in the `handleLogin()` function if needed

### Screenshots
The test automatically captures screenshots at key milestones:

- `screenshots/01-login-complete.png` - After successful login
- `screenshots/02-onboarding-complete.png` - After onboarding completion
- `screenshots/03-courses-page-loaded.png` - When course list loads
- `screenshots/04-course-opened.png` - When course page opens
- `screenshots/05-consent-handled.png` - After consent form submission
- `screenshots/06a-start-learning-clicked.png` - When starting course content
- `screenshots/06b-content-consumption-attempted.png` - After content consumption
- `screenshots/07-course-consumption-complete.png` - After course completion
- `screenshots/08-final-verification.png` - Final verification screenshot

### Auth State
- Saves authentication state to `tests/consumption_1/auth.json`
- Can be reused by other tests if needed

## Test Structure

### Phase 1: Authentication
1. Navigate to Sunbird portal
2. Handle Keycloak login flow
3. Submit credentials and wait for authentication
4. Save authentication state

### Phase 2: Onboarding
1. Detect welcome/onboarding modal
2. Select user role (Teacher/Student/Parent/Other)
3. Complete onboarding flow
4. Wait for modal dismissal

### Phase 3: Course Discovery
1. Navigate to courses section
2. Wait for course cards to load
3. Handle loading states and retries
4. Identify available courses

### Phase 4: Course Joining
1. Click on first available course
2. Handle consent/permission forms
3. Join course successfully
4. Navigate to course content

### Phase 5: Content Consumption
1. Check current course progress
2. Identify incomplete content
3. Consume various content types:
   - Videos (with playback simulation)
   - PDFs/Documents (with reading simulation)
   - Interactive content
4. Mark content as complete

### Phase 6: Verification
1. Verify course completion status
2. Check for 100% completion
3. Capture final state
4. Log completion status

## Customization

### Modify Content Consumption Strategy
Update the `consumeCourseContent()` function to:
- Target specific content types
- Adjust consumption timing
- Add custom interaction patterns

### Adjust Role Selection
Modify the `handleOnboarding()` function to:
- Prefer specific roles
- Handle custom onboarding flows
- Add additional selection criteria

### Change Course Selection Logic
Update the course discovery section to:
- Filter courses by specific criteria
- Target courses with specific completion levels
- Handle course prerequisites

### Add Custom Verification
Extend the verification phase to:
- Check for certificates
- Validate specific completion metrics
- Add custom success criteria

## Debugging

### Common Issues and Solutions

#### Login Failures
- Check credentials in `handleLogin()` function
- Verify Keycloak URL is accessible
- Check for server errors or maintenance

#### Onboarding Modal Not Found
- Check if onboarding is required for the user
- Verify modal selectors are up to date
- Check if user has already completed onboarding

#### Course Cards Not Loading
- Verify network connectivity
- Check for server errors (502/503/504)
- Ensure proper navigation to courses section

#### Content Not Consuming
- Check content type detection logic
- Verify content interaction selectors
- Ensure proper timing for content loading

### Debug Mode
Run with `--debug` flag to:
- Step through each action manually
- Inspect element selectors in real-time
- Modify selectors on the fly
- Capture detailed execution logs

### Video Recording
Use `--video=on` to:
- Record entire test execution
- Review failed actions visually
- Share recordings with team members
- Analyze timing and interaction issues

## Integration

This test can be:
- **Standalone**: Run independently for full flow validation
- **Part of Suite**: Integrated with other consumption tests
- **CI/CD**: Automated in continuous integration pipelines
- **Smoke Test**: Used for environment health checks

The test is designed to be robust and self-healing, making it suitable for automated environments and regular execution.