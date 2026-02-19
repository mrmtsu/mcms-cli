export const EXIT_CODE = {
  SUCCESS: 0,
  UNKNOWN: 1,
  INVALID_INPUT: 2,
  AUTH: 3,
  PERMISSION: 4,
  NETWORK: 5,
  CONFLICT: 6
} as const;

export type ExitCode = (typeof EXIT_CODE)[keyof typeof EXIT_CODE];
