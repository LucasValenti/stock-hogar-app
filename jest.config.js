/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  testMatch: ['<rootDir>/src/**/*.test.{ts,tsx}'],
  // Mismo alias que tsconfig.json: "@/*" apunta a src/.
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
};
