'use client';

import {
  ComposedChart, Bar, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import type { YearlyProjection, PlanningMode } from '@/lib/types';
import { formatCurrency } from '@/lib/calculations';

interface Props {
  projections: YearlyProjection[];
  mode: PlanningMode;
  p1Name: string;
  p2Name: string;
}

function toChartData(p: YearlyProjection) {
  const statePension = Math.round(p.p1StatePension + p.p2StatePension);
  const dbPension    = Math.round(p.p1DbPension    + p.p2DbPension);
  const workIncome   = Math.round(p.p1PartTimeWork + p.p2PartTimeWork);
  const propertyRent = Math.round(p.propertyRent);
  const otherIncome  = Math.round(p.p1OtherIncome  + p.p2OtherIncome);
  const isaDrawdown  = Math.round(p.isaDrawdown);
  const giaDrawdown  = Math.round(p.giaDrawdown);
  const cashDrawdown = Math.round(p.cashDrawdown);
  const dcDrawdown   = Math.round(p.dcDrawdown);
  const spending     = Math.round(p.spending);
  const tax          = Math.round(p.totalTaxPaid);

  // Subtract the tax liability from income source bars, attributing it to the
  // most taxable sources first (DC → GIA → ISA → Cash). This keeps the visual
  // stack correct: net bars + tax bar = totalIncome drawn.
  let taxLeft = tax;
  const deduct = (gross: number) => {
    const d = Math.min(gross, taxLeft); taxLeft -= d; return gross - d;
  };
  const netDcDrawdown   = deduct(dcDrawdown);
  const netGiaDrawdown  = deduct(giaDrawdown);
  const netIsaDrawdown  = deduct(isaDrawdown);
  const netCashDrawdown = deduct(cashDrawdown);

  const netTotal = statePension + dbPension + workIncome + propertyRent + otherIncome
                 + netIsaDrawdown + netGiaDrawdown + netCashDrawdown + netDcDrawdown;

  // Shortfall only when plan can't fund spending even after gross-up (asset depletion)
  const shortfall = Math.max(0, spending - netTotal - tax);

  return {
    age: p.p1Age, p2Age: p.p2Age,
    statePension, dbPension, workIncome, propertyRent, otherIncome,
    isaDrawdown: netIsaDrawdown,
    giaDrawdown: netGiaDrawdown,
    cashDrawdown: netCashDrawdown,
    dcDrawdown: netDcDrawdown,
    tax,
    shortfall,
    spending,
  };
}

const BARS = [
  { key: 'statePension',  label: 'State Pension',     color: '#2563eb' },
  { key: 'dbPension',     label: 'DB Pension',        color: '#7c3aed' },
  { key: 'workIncome',    label: 'Work / Consulting', color: '#059669' },
  { key: 'propertyRent',  label: 'Rental Income',     color: '#0891b2' },
  { key: 'otherIncome',   label: 'Other Income',      color: '#06b6d4' },
  { key: 'isaDrawdown',   label: 'ISA',               color: '#10b981' },
  { key: 'giaDrawdown',   label: 'Investments (GIA)', color: '#84cc16' },
  { key: 'cashDrawdown',  label: 'Cash Savings',      color: '#f59e0b' },
  { key: 'dcDrawdown',    label: 'DC Pension',        color: '#f97316' },
];

const TAX_COLOR      = '#94a3b8'; // slate-400
const SHORTFALL_COLOR = '#ef4444';

function formatY(v: number) { return v >= 1000 ? `£${(v / 1000).toFixed(0)}k` : `£${v}`; }

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;

  const spendingEntry  = payload.find((p: any) => p.dataKey === 'spending');
  const shortfallEntry = payload.find((p: any) => p.dataKey === 'shortfall');
  const taxEntry       = payload.find((p: any) => p.dataKey === 'tax');
  const shortfall      = shortfallEntry?.value ?? 0;
  const taxAmount      = taxEntry?.value ?? 0;
  const p2             = payload[0]?.payload?.p2Age;

  const incomeBars = payload.filter(
    (p: any) => !['spending', 'shortfall', 'tax'].includes(p.dataKey) && p.value > 0,
  );
  const netSpendable = incomeBars.reduce((s: number, p: any) => s + (p.value ?? 0), 0);
  const gap = netSpendable - (spendingEntry?.value ?? 0); // used for surplus display

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-lg p-4 text-sm min-w-[260px]">
      <p className="font-bold text-slate-800 mb-2">Age {label}{p2 != null ? ` / ${p2}` : ''}</p>

      {incomeBars.map((p: any) => (
        <div key={p.dataKey} className="flex items-center justify-between gap-4 mb-1">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ backgroundColor: p.fill }} />
            {p.name}
          </span>
          <span className="font-medium">{formatCurrency(p.value)}</span>
        </div>
      ))}

      <div className="border-t border-slate-200 mt-2 pt-2 space-y-1">
        {taxAmount > 0 && (
          <div className="flex justify-between text-slate-500">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ backgroundColor: TAX_COLOR }} />
              Tax
            </span>
            <span>+{formatCurrency(taxAmount)}</span>
          </div>
        )}

        <div className="flex justify-between gap-4 text-slate-600">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-slate-700 inline-block flex-shrink-0" />
            Required spending
          </span>
          <span className="font-semibold flex-shrink-0">{formatCurrency(spendingEntry?.value ?? 0)}</span>
        </div>

        {shortfall > 0 ? (
          <div className="flex justify-between font-bold text-red-600 pt-1">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm inline-block bg-red-500" />
              Shortfall
            </span>
            <span>−{formatCurrency(shortfall)}</span>
          </div>
        ) : gap > 1 ? (
          <div className="flex justify-between font-bold text-emerald-600 pt-1">
            <span>Surplus</span>
            <span>+{formatCurrency(gap)}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default function LifetimeChart({ projections }: Props) {
  const data = projections.filter((_, i) => i % 2 === 0 || projections.length <= 20).map(toChartData);
  const activeBars  = BARS.filter(b => data.some(d => (d as any)[b.key] > 0));
  const hasTax      = data.some(d => d.tax > 0);
  const hasShortfall = data.some(d => d.shortfall > 0);

  return (
    <ResponsiveContainer width="100%" height={400}>
      <ComposedChart data={data} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
        <XAxis dataKey="age" tick={{ fontSize: 12, fill: '#64748b' }} tickLine={false}
          label={{ value: 'Age', position: 'insideBottom', offset: -2, fontSize: 12, fill: '#94a3b8' }} />
        <YAxis tickFormatter={formatY} tick={{ fontSize: 12, fill: '#64748b' }} tickLine={false} axisLine={false} width={55} />
        <Tooltip content={<CustomTooltip />} />
        <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '12px' }} iconType="square" iconSize={10} />
        {activeBars.map(b => (
          <Bar key={b.key} dataKey={b.key} name={b.label} stackId="income" fill={b.color} />
        ))}
        {hasTax && (
          <Bar dataKey="tax" name="Tax" stackId="income" fill={TAX_COLOR}
            radius={hasShortfall ? [0, 0, 0, 0] : [4, 4, 0, 0]} />
        )}
        {hasShortfall && (
          <Bar dataKey="shortfall" name="Shortfall" stackId="income" fill={SHORTFALL_COLOR}
            radius={[4, 4, 0, 0]} />
        )}
        <Line dataKey="spending" name="Required spending" type="monotone"
          stroke="#0f172a" strokeWidth={2.5} dot={false} strokeDasharray="6 3" />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
