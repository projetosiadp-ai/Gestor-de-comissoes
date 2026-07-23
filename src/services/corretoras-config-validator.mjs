export function isValidCorretorasConfig(config) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) return false;
  return Object.entries(config).every(([brokerName, aliases]) =>
    typeof brokerName === 'string' &&
    brokerName.trim().length > 0 &&
    brokerName.length <= 200 &&
    Array.isArray(aliases) &&
    aliases.length <= 100 &&
    aliases.every(alias => typeof alias === 'string' && alias.trim().length > 0 && alias.length <= 200)
  );
}
