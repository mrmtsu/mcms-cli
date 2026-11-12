const MINIMUM_VERSIONS = new Map<number, readonly [minor: number, patch: number]>([
  [22, [23, 5]],
  [24, [22, 3]],
  [26, [13, 1]],
]);

export function isSupportedNodeVersion(version: string): boolean {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) {
    return false;
  }

  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);
  const minimum = MINIMUM_VERSIONS.get(major);

  return (
    minimum !== undefined && (minor > minimum[0] || (minor === minimum[0] && patch >= minimum[1]))
  );
}
