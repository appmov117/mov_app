import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Layer, Source } from "react-map-gl/mapbox";
import { api } from "../../lib/api.ts";
import { HEAT_RAMP, heatFill } from "../../lib/heat.ts";
import { useWide } from "../../lib/useWide.ts";
import { FlatMap } from "../../components/FlatMap.tsx";
import { Filters } from "./ui.tsx";

type Kind = "demand" | "served" | "unserved";
type Days = "1" | "7" | "30";
type Heat = {
  type: "FeatureCollection";
  features: { type: "Feature"; properties: { cell: string; count: number }; geometry: { type: "Polygon"; coordinates: number[][][] } }[];
  total: number;
  max: number;
};


const KINDS: { id: Kind; label: string; detail: string }[] = [
  { id: "demand", label: "Demanda", detail: "Todas las solicitudes, por punto de recogida." },
  { id: "served", label: "Atendidas", detail: "Solicitudes que consiguieron conductor." },
  { id: "unserved", label: "Sin conductor", detail: "Solicitudes que vencieron sin que nadie aceptara: dónde faltan conductores." },
];

export function Heatmap() {
  const [kind, setKind] = useState<Kind>("demand");
  const [days, setDays] = useState<Days>("7");
  const heat = useQuery({
    queryKey: ["admin-heat", kind, days],
    queryFn: () => api<Heat>(`/api/v1/admin/heatmap?kind=${kind}&days=${days}`),
    placeholderData: keepPreviousData,
  });
  const wide = useWide();
  const data = heat.data;
  // Encuadra las zonas con solicitudes; el panel flotante ocupa la izquierda en pantallas anchas.
  const corners = (data?.features ?? []).flatMap((feature) => feature.geometry.coordinates[0].map(([longitude, latitude]) => ({ latitude, longitude })));
  const max = Math.max(1, data?.max ?? 1);

  return (
    <div className="flex h-full flex-col lg:relative lg:block">
      <div className="relative min-h-[260px] flex-1 lg:absolute lg:inset-0">
      <FlatMap
        zoom={12}
        fit={corners}
        fitKey={data ? `${kind}-${days}-${data.features.length}` : ""}
        padding={wide ? { top: 60, bottom: 60, left: 420, right: 60 } : { top: 30, bottom: 30, left: 30, right: 30 }}
      >
        {data && (
          <Source id="heat" type="geojson" data={data}>
            <Layer id="heat-fill" type="fill" paint={{ "fill-color": heatFill(max), "fill-opacity": 0.82 }} />
            <Layer id="heat-line" type="line" paint={{ "line-color": "#fb923c", "line-width": 0.6, "line-opacity": 0.6 }} />
          </Source>
        )}
      </FlatMap>
      </div>
      <aside className="max-h-[52%] shrink-0 overflow-y-auto border-t border-line bg-surface p-4 lg:absolute lg:left-4 lg:top-4 lg:max-h-none lg:w-[360px] lg:rounded-2xl lg:border lg:p-5 lg:shadow-[0_18px_50px_rgba(16,24,32,0.16)]">
        <h1 className="hidden text-xl font-extrabold lg:block">Mapa de calor</h1>
        <p className="text-sm text-muted lg:mt-1">{KINDS.find((item) => item.id === kind)?.detail}</p>
        <div className="mt-3 space-y-2 lg:mt-4 lg:space-y-3">
          <Filters value={kind} onChange={setKind} options={KINDS.map(({ id, label }) => ({ id, label }))} />
          <Filters
            value={days}
            onChange={setDays}
            options={[
              { id: "1", label: "Hoy" },
              { id: "7", label: "7 días" },
              { id: "30", label: "30 días" },
            ]}
          />
        </div>
        <p className="mt-3 text-sm text-muted lg:mt-5">
          <span className="mr-1.5 align-baseline text-3xl font-extrabold tabular-nums text-ink">{data?.total ?? "—"}</span>
          solicitudes en {data?.features.length ?? 0} zonas
        </p>
        <div className="mt-3 lg:mt-4">
          <div className="flex h-2.5 overflow-hidden rounded-full">
            {HEAT_RAMP.map((color) => <span key={color} className="flex-1" style={{ background: color }} />)}
          </div>
          <div className="mt-1 flex justify-between text-xs text-muted tabular-nums">
            <span>1</span>
            <span>{max} por zona</span>
          </div>
        </div>
        <p className="mt-4 hidden text-xs text-muted lg:block">Cada zona es un hexágono H3 de resolución 9, de unos 0.1 km².</p>
      </aside>
    </div>
  );
}
