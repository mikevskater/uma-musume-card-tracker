module.exports = {
    testEnvironment: 'node',
    roots: ['<rootDir>/tests'],
    testMatch: ['**/*.test.js'],
    // Global setup that runs before each test file
    setupFiles: ['<rootDir>/tests/setup.js'],
    // Increase timeout for integration tests that load real data
    testTimeout: 15000,
};
