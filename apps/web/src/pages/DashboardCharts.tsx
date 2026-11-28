import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

/*
 * Recharts lives in this module only, so it is loaded with the dashboard
 * chunk. Colors are design tokens (CSS variables), never raw hex; every chart
 * has a data table next to it (rendered by the page), so nothing relies on
 * color or on the SVG alone. The SVG is hidden from assistive technology and
 * keyboard focus; the tables carry the same data.
 */

const axis = {
  stroke: 'var(--color-border)',
  tick: { fill: 'var(--color-muted-foreground)', fontSize: 14 },
  tickLine: false,
} as const;

const tooltip = {
  cursor: { fill: 'var(--color-muted)' },
  contentStyle: {
    background: 'var(--color-card)',
    border: '1px solid var(--color-border)',
    borderRadius: 8,
    color: 'var(--color-foreground)',
  },
} as const;

/** Grouped bars: votes and attendees per category (two series, legend + direct labels). */
export function CategoryChart({
  data,
}: {
  data: { label: string; votes: number; attendees: number }[];
}) {
  return (
    <div className="h-72 w-full" aria-hidden="true">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          accessibilityLayer={false}
          data={data}
          barGap={2}
          margin={{ top: 24, right: 8, left: 0, bottom: 0 }}
        >
          <CartesianGrid vertical={false} stroke="var(--color-muted)" />
          <XAxis dataKey="label" {...axis} />
          <YAxis allowDecimals={false} width={40} {...axis} axisLine={false} />
          <Tooltip {...tooltip} />
          <Legend
            itemSorter={null}
            formatter={(value: string) => (
              // Legend text wears the text token; the swatch carries the series color.
              <span style={{ color: 'var(--color-foreground)' }}>{value}</span>
            )}
          />
          <Bar
            dataKey="votes"
            name="Oy"
            fill="var(--color-chart-1)"
            radius={[4, 4, 0, 0]}
            maxBarSize={40}
            isAnimationActive={false}
          >
            <LabelList dataKey="votes" position="top" fill="var(--color-foreground)" />
          </Bar>
          <Bar
            dataKey="attendees"
            name="Katılımcı"
            fill="var(--color-chart-2)"
            radius={[4, 4, 0, 0]}
            maxBarSize={40}
            isAnimationActive={false}
          >
            <LabelList dataKey="attendees" position="top" fill="var(--color-foreground)" />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** One series of bars; horizontal for long category names (reasons). */
export function SingleBarChart({
  data,
  name,
  horizontal = false,
}: {
  data: { label: string; value: number }[];
  name: string;
  horizontal?: boolean;
}) {
  const height = horizontal ? Math.max(160, data.length * 40) : 256;
  return (
    <div className="w-full" style={{ height }} aria-hidden="true">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          accessibilityLayer={false}
          data={data}
          layout={horizontal ? 'vertical' : 'horizontal'}
          margin={{ top: 16, right: 32, left: 0, bottom: 0 }}
        >
          <CartesianGrid
            vertical={horizontal}
            horizontal={!horizontal}
            stroke="var(--color-muted)"
          />
          {horizontal ? (
            <>
              <XAxis type="number" allowDecimals={false} {...axis} axisLine={false} />
              <YAxis type="category" dataKey="label" width={170} {...axis} />
            </>
          ) : (
            <>
              <XAxis dataKey="label" {...axis} />
              <YAxis allowDecimals={false} width={40} {...axis} axisLine={false} />
            </>
          )}
          <Tooltip {...tooltip} />
          <Bar
            dataKey="value"
            name={name}
            fill="var(--color-chart-1)"
            radius={horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]}
            maxBarSize={32}
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
