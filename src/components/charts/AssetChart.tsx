'use client';

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import type { YearlyProjection } from '@/lib/types';
import { formatCurrency } from '@/lib/calculations';

interface Props { projections: YearlyProjection[] }

function formatY(v: number) {
  if (v >= 1000000) return `£${(v / 1000000).toFixed(1)}m`;
  if (v >= 1000) return `£${(v / 1000).toFixed(0)}k`;
  return `£${v}`;
}

function formatTooltipAge(label: string | number, p2Age?: number | null): string {
  return `Age ${label}${p2Age != null ? ` / ${p2Age}` : ''}`;
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const p2 = payload[0]?.payload?.p2Age;
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-lg p-4 text-sm min-w-[180px]">
      <p className="font-bold text-slate-800 mb-2">{formatTooltipAge(label, p2)}</p>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center justify-between gap-4 mb-1">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ backgroundColor: p.stroke }} />
            {p.name}
          </span>
          <span className="font-medium">{formatCurrency(p.value)}</span>
        </div>
      ))}
    </div>
  );
};

export default function AssetChart({ projections }: Props) {
  const data = projections
    .filter((_, i, arr) => i % 2 === 0 || arr.length <= 20 || i === arr.length - 1)
    .map(p => ({
      age:              p.p1Age,
      p2Age:            p.p2Age,
      isaBalance:       Math.round(p.p1IsaBalance  + p.p2IsaBalance),
      giaBalance:       Math.round(p.p1GiaValue    + p.p2GiaValue    + p.jointGiaValue),
      cashBalance:      Math.round(p.p1CashBalance + p.p2CashBalance),
      dcBalance:        Math.round(p.p1DcBalance   + p.p2DcBalance),
      careReserve:      Math.round(p.careReserveBalance ?? 0),
      totalAssets:      Math.round(p.totalAssets),
    }));

  const hasISA         = data.some(d => d.isaBalance > 0);
  const hasGIA         = data.some(d => d.giaBalance > 0);
  const hasCash        = data.some(d => d.cashBalance > 0);
  const hasDC          = data.some(d => d.dcBalance > 0);
  const hasCareReserve = data.some(d => d.careReserve > 0);

  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart data={data} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
        <defs>
          {[
            { id: 'isaGrad',       color: '#10b981' }, // emerald  – ISA
            { id: 'giaGrad',       color: '#8b5cf6' }, // violet   – Investments (was lime, too close to emerald)
            { id: 'cashGrad',      color: '#f59e0b' }, // amber    – Cash
            { id: 'dcGrad',        color: '#ef4444' }, // red      – DC Pension
            { id: 'careGrad',      color: '#06b6d4' }, // cyan     – Care Reserve (was teal, too close to emerald)
          ].map(({ id, color }) => (
            <linearGradient key={id} id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor={color} stopOpacity={0.3} />
              <stop offset="95%" stopColor={color} stopOpacity={0.05} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
        <XAxis
          dataKey="age"
          tick={{ fontSize: 12, fill: '#64748b' }}
          tickLine={false}
          label={{ value: 'Age', position: 'insideBottom', offset: -2, fontSize: 12, fill: '#94a3b8' }}
        />
        <YAxis tickFormatter={formatY} tick={{ fontSize: 12, fill: '#64748b' }} tickLine={false} axisLine={false} width={60} />
        <Tooltip content={<CustomTooltip />} />
        <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '12px' }} iconType="square" iconSize={10} />

        {hasISA         && <Area type="monotone" dataKey="isaBalance"  name="ISA"          stroke="#10b981" fill="url(#isaGrad)"  strokeWidth={2} />}
        {hasGIA         && <Area type="monotone" dataKey="giaBalance"  name="Investments"  stroke="#8b5cf6" fill="url(#giaGrad)"  strokeWidth={2} />}
        {hasCash        && <Area type="monotone" dataKey="cashBalance" name="Cash"         stroke="#f59e0b" fill="url(#cashGrad)" strokeWidth={2} />}
        {hasDC          && <Area type="monotone" dataKey="dcBalance"   name="DC Pension"   stroke="#ef4444" fill="url(#dcGrad)"   strokeWidth={2} />}
        {hasCareReserve && <Area type="monotone" dataKey="careReserve" name="Care Reserve" stroke="#06b6d4" fill="url(#careGrad)" strokeWidth={2} strokeDasharray="5 3" />}
        <Area
          type="monotone"
          dataKey="totalAssets"
          name="Investment Total"
          stroke="#2563eb"
          fill="none"
          strokeWidth={2.5}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export { formatTooltipAge };
