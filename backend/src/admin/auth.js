// Eenvoudige admin-auth-placeholder (Bearer ADMIN_TOKEN). De definitieve auth wordt
// Entra External ID (fase 3, zie wiki/decisions.md). Als ADMIN_TOKEN niet gezet is
// (lokale ontwikkeling) is toegang toegestaan.
function isAdmin(request) {
  const verwacht = process.env.ADMIN_TOKEN;
  if (!verwacht) return true;
  const auth = (request.headers && request.headers.get('authorization')) || '';
  return auth === `Bearer ${verwacht}`;
}

module.exports = { isAdmin };
