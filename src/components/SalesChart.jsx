// Net revenue for the last 6 months (paid orders, INR, after refunds), worked out on the server.
function SalesChart({ months = [] }) {
  const points = months.map((month) => [month.label || month.key, Number(month.revenue || 0)]);
  const hasSales = points.some(([, value]) => value > 0);

  const maxValue = Math.max(...points.map(([, value]) => value), 1);
  const chartHeight = 160;
  const chartWidth = 520;
  const stepX = points.length > 1 ? chartWidth / (points.length - 1) : 0;
  const polylinePoints = points
    .map(([, value], index) => {
      const x = Math.round(index * stepX);
      const y = Math.round(chartHeight - (value / maxValue) * (chartHeight - 16));
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <div className="sales-chart">
      <h3 style={{ margin: "0 0 14px" }}>Sales Revenue (Last 6 Months)</h3>
      {!hasSales ? (
        <p style={{ margin: 0, color: "#6b7280" }}>No paid orders in the last 6 months.</p>
      ) : (
        <div className="sales-line-chart">
          <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} preserveAspectRatio="none">
            <polyline className="sales-line" points={polylinePoints} />
            {points.map(([label, value], index) => {
              const x = Math.round(index * stepX);
              const y = Math.round(chartHeight - (value / maxValue) * (chartHeight - 16));

              return <circle key={label} className="sales-point" cx={x} cy={y} r="4" />;
            })}
          </svg>
        </div>
      )}
      {hasSales && (
        <div className="sales-line-labels">
          {points.map(([label, value]) => (
            <div key={label}>
              <span>{label}</span>
              <strong>₹{Math.round(value).toLocaleString("en-IN")}</strong>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default SalesChart;
