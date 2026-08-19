# End-to-End Tests with Playwright

This directory contains the Playwright E2E tests for the application.

## Prerequisites
Ensure you have all dependencies installed in the root, client, and server directories.

## Running Tests
You can run the E2E tests from the root of the project using:
\\\ash
npm run e2e
\\\

Alternatively, navigate to this e2e/ directory and run Playwright commands directly:
\\\ash
cd e2e
npx playwright test
\\\

### UI Mode
To open the interactive Playwright UI:
\\\ash
cd e2e
npx playwright test --ui
\\\

## Test Scenarios
- **App Basic Tests**: Smoke test to verify that the app loads successfully and the basic UI elements are rendered.
- **Offline Emulation**: Tests the app's behavior when the network is disconnected, verifying the offline UI state.
- **Jam Session**: A multi-browser test that opens two separate contexts (Host and Listener), creates a Jam Session, and ensures the Listener successfully synchronizes with the Host.
