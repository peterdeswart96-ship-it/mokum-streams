// Eenvoudige admin-auth-placeholder (Bearer ADMIN_TOKEN). De definitieve auth wordt
// Entra External ID (fase 3, zie wiki/decisions.md). Als ADMIN_TOKEN niet gezet is
// (lokale ontwikkeling) is toegang toegestaan.
function bearerGeldig(request, verwacht) {
  if (!verwacht) return true; // niet ingericht → lokaal toegestaan
  const auth = (request.headers && request.headers.get('authorization')) || '';
  return auth === `Bearer ${verwacht}`;
}

function isAdmin(request) {
  return bearerGeldig(request, process.env.ADMIN_TOKEN);
}

// Agent-auth (Bearer AGENT_TOKEN), gebruikt door /api/agent/*.
function isAgent(request) {
  return bearerGeldig(request, process.env.AGENT_TOKEN);
}

module.exports = { isAdmin, isAgent };
