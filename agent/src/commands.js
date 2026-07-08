// Pure validatie van agent-commando's (zie docs/api-contract.md v0.3). Géén
// netwerk/OBS → unit-testbaar. Types: startStream | stopStream | setOverlay.

const GELDIGE_TYPES = new Set(['startStream', 'stopStream', 'setOverlay']);

function valideerCommando(cmd) {
  if (!cmd || typeof cmd !== 'object') throw new Error('commando is geen object');
  if (!GELDIGE_TYPES.has(cmd.type)) throw new Error(`onbekend commandotype: ${cmd.type}`);
  if (!Number.isInteger(cmd.tableNumber)) throw new Error('tableNumber ontbreekt of is geen geheel getal');
  if (cmd.type === 'setOverlay') {
    if (!cmd.sourceName) throw new Error('setOverlay vereist sourceName');
    if (typeof cmd.enabled !== 'boolean') throw new Error('setOverlay vereist enabled (boolean)');
  }
  return cmd;
}

module.exports = { GELDIGE_TYPES, valideerCommando };
