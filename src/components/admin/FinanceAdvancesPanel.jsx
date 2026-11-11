import { useState } from "react";
import { Download, Hourglass, Undo2, FileWarning, ChevronDown } from "lucide-react";
import "./FinanceAdvancesPanel.css";

const inr = (n) => (Number(n) || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const day = (d) => {
  if (!d) return "-";
  const date = new Date(d);
  return Number.isNaN(date.getTime())
    ? "-"
    : date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
};

/** CSV cell, quoted, with spreadsheet formulas neutralised. */
function cell(value) {
  let str = String(value ?? "");
  if (/^\s*[=+\-@\t\r]/.test(str) && !/^-?\d/.test(str)) str = `'${str}`;
  return `"${str.replaceAll('"', '""')}"`;
}

function downloadCsv(filename, headers, rows) {
  const csv = `\uFEFF${[headers, ...rows].map((r) => r.map(cell).join(",")).join("\r\n")}\r\n`;
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Advances (money received for orders not invoiced yet), advances refunded in the period, and
 * paid orders that were invoiced at payment under the old rule and still haven't shipped.
 */
function FinanceAdvancesPanel({ advances, periodLabel }) {
  const [open, setOpen] = useState("");
  if (!advances) return null;
  const { outstanding, refundedInPeriod, invoicedBeforeDispatch } = advances;
  const stamp = new Date().toISOString().slice(0, 10);

  const exportAdvances = () =>
    downloadCsv(
      `advances-${stamp}.csv`,
      ["Order ref", "Order date", "Customer", "Status", "Waiting for", "Amount (INR)", "Days waiting"],
      outstanding.rows.map((r) => [r.orderRef, day(r.orderDate), r.customer, r.status, r.waitingFor, inr(r.amountInr), r.ageDays ?? ""])
    );
  const exportLegacy = () =>
    downloadCsv(
      `invoiced-before-dispatch-${stamp}.csv`,
      ["Invoice no.", "Invoice date", "Order ref", "Customer", "Amount (INR)"],
      invoicedBeforeDispatch.rows.map((r) => [r.invoiceNumber, day(r.invoiceDate), r.orderRef, r.customer, inr(r.amountInr)])
    );

  return (
    <section className="fin-advances" aria-labelledby="fin-advances-title">
      <div className="fin-advances-head">
        <h3 id="fin-advances-title">Advances & pending invoices</h3>
        <p>Money received before dispatch is an advance, not a sale. It moves into sales when the order ships and its invoice is issued.</p>
      </div>

      <div className="fin-advances-cards">
        <div className="fin-kpi-card">
          <div className="fin-kpi-top">
            <span className="fin-kpi-label">Advances outstanding (INR)</span>
            <div className="fin-kpi-icon-wrap"><Hourglass size={22} aria-hidden="true" /></div>
          </div>
          <div className="fin-kpi-value-row">
            <span className="fin-kpi-currency">₹</span>
            <span className="fin-kpi-amount">{inr(outstanding.amountInr)}</span>
          </div>
          <div className="fin-kpi-footer">
            <span className="fin-kpi-tag amber">
              {outstanding.count} {outstanding.count === 1 ? "order" : "orders"} now
              {outstanding.oldestOrderDate ? ` · oldest ${day(outstanding.oldestOrderDate)}` : ""}
            </span>
          </div>
        </div>

        <div className="fin-kpi-card">
          <div className="fin-kpi-top">
            <span className="fin-kpi-label">Advances refunded (INR)</span>
            <div className="fin-kpi-icon-wrap"><Undo2 size={22} aria-hidden="true" /></div>
          </div>
          <div className="fin-kpi-value-row">
            <span className="fin-kpi-currency">₹</span>
            <span className="fin-kpi-amount">{inr(refundedInPeriod.amountInr)}</span>
          </div>
          <div className="fin-kpi-footer">
            <span className="fin-kpi-tag blue">
              {refundedInPeriod.count} cancelled before dispatch{periodLabel ? ` · ${periodLabel}` : ""} · no credit note
            </span>
          </div>
        </div>

        <div className="fin-kpi-card">
          <div className="fin-kpi-top">
            <span className="fin-kpi-label">Invoiced before dispatch (old rule)</span>
            <div className="fin-kpi-icon-wrap"><FileWarning size={22} aria-hidden="true" /></div>
          </div>
          <div className="fin-kpi-value-row">
            <span className="fin-kpi-amount">{invoicedBeforeDispatch.count}</span>
          </div>
          <div className="fin-kpi-footer">
            <span className="fin-kpi-tag purple">₹{inr(invoicedBeforeDispatch.amountInr)} · unshipped, invoice kept</span>
          </div>
        </div>
      </div>

      {[
        {
          key: "advances",
          title: `Advances outstanding (${outstanding.count})`,
          rows: outstanding.rows,
          onExport: exportAdvances,
          headers: ["Order", "Order date", "Customer", "Waiting for", "Days", "Amount (INR)"],
          render: (r) => [`#${r.orderRef}`, day(r.orderDate), r.customer, r.waitingFor, r.ageDays ?? "-", inr(r.amountInr)]
        },
        {
          key: "legacy",
          title: `Invoiced before dispatch (${invoicedBeforeDispatch.count})`,
          rows: invoicedBeforeDispatch.rows,
          onExport: exportLegacy,
          headers: ["Invoice no.", "Invoice date", "Order", "Customer", "Amount (INR)"],
          render: (r) => [r.invoiceNumber, day(r.invoiceDate), `#${r.orderRef}`, r.customer, inr(r.amountInr)]
        }
      ].map((list) => (
        <div key={list.key} className="fin-advances-list">
          <div className="fin-advances-list-head">
            <button
              type="button"
              className="fin-advances-toggle"
              aria-expanded={open === list.key}
              onClick={() => setOpen((cur) => (cur === list.key ? "" : list.key))}
              disabled={list.rows.length === 0}
            >
              <ChevronDown size={16} aria-hidden="true" className={open === list.key ? "is-open" : ""} />
              {list.title}
            </button>
            <button type="button" className="fin-advances-export" onClick={list.onExport} disabled={list.rows.length === 0}>
              <Download size={15} aria-hidden="true" />
              Export CSV
            </button>
          </div>
          {open === list.key && list.rows.length > 0 ? (
            <div className="table-scroll">
              <table className="fin-advances-table">
                <thead>
                  <tr>{list.headers.map((h) => <th key={h}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {list.rows.map((r) => (
                    <tr key={r.orderId}>
                      {list.render(r).map((v, i) => <td key={i}>{v}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      ))}
    </section>
  );
}

export default FinanceAdvancesPanel;
