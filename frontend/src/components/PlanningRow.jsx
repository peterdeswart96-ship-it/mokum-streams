// Eén rij in het planning-overzicht: toernooi/competitie met schakelaars voor
// streamen, camera's en overlays. Wijzigingen gaan via onChange → API.
export default function PlanningRow({ record, cameras, onChange }) {
  const r = record;
  const overlays = r.overlays || {};
  const tafels = new Set((r.tafels || []).map(Number));

  function toggleTafel(n) {
    const nieuw = new Set(tafels);
    if (nieuw.has(n)) nieuw.delete(n);
    else nieuw.add(n);
    onChange(r.tournamentId, { tafels: [...nieuw].sort((a, b) => a - b) });
  }

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="font-medium">{r.name || '(naamloos)'}</div>
          <div className="text-xs text-slate-500">
            {r.date || '—'} · {r.type === 'competition' ? 'competitie' : 'toernooi'}
            {r.plannedStart ? ` · start ${new Date(r.plannedStart).toLocaleString('nl-NL')}` : ''}
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm shrink-0">
          <input
            type="checkbox"
            checked={r.enabled !== false}
            onChange={(e) => onChange(r.tournamentId, { enabled: e.target.checked })}
          />
          Streamen
        </label>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
        <div className="flex items-center gap-2">
          <span className="text-slate-500">Camera's:</span>
          {cameras.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => toggleTafel(n)}
              className={
                'px-2 py-1 rounded border text-xs ' +
                (tafels.has(n)
                  ? 'bg-emerald-600 text-white border-emerald-600'
                  : 'bg-slate-50 text-slate-600 border-slate-300')
              }
            >
              {n}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={overlays.sponsors !== false}
            onChange={(e) => onChange(r.tournamentId, { overlays: { ...overlays, sponsors: e.target.checked } })}
          />
          Sponsors
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={overlays.scoreboard !== false}
            onChange={(e) => onChange(r.tournamentId, { overlays: { ...overlays, scoreboard: e.target.checked } })}
          />
          Scorebord
        </label>
      </div>
    </div>
  );
}
