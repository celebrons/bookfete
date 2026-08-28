module.exports = {
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/tests/setup.js'],
  testMatch: ['<rootDir>/tests/**/*.test.js'],
  // Les timers de nettoyage (jobs PDF) et les handles ouverts ne doivent pas
  // faire echouer la suite : ils sont unref().
  forceExit: false,
  detectOpenHandles: false,
  clearMocks: true,
  restoreMocks: true,
  testPathIgnorePatterns: ['/node_modules/', '/tmp/'],
  collectCoverageFrom: ['routes/**/*.js', 'services/**/*.js', 'utils/**/*.js', 'middleware/**/*.js']
};
