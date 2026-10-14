"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Invoice } from "../../shared/schema";

const money = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });
const number = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 6 });
const missing = <span className="missing">À vérifier</span>;
const value = (input: string | number | null, currency = false) => input === null
  ? missing : typeof input === "number" ? currency ? money.format(input) : number.format(input) : input;
function hasNull(input: unknown): boolean {
  return input === null || (typeof input === "object" && Object.values(input).some(hasNull));
}
function state(invoice: Invoice) {
  if (invoice.status === "failure") return "failure";
  return invoice.warnings.length || hasNull(invoice.data) ? "review" : "clear";
}
const labels = { failure: "Échec", review: "À vérifier", clear: "Sans alerte" };
const warningLabels = {
  missing_field: "Information absente", unreadable_field: "Lecture incertaine",
  consistency_mismatch: "Écart de montant", check_skipped: "Contrôle non effectué",
};

export default function InvoiceReview({ invoices }: { invoices: Invoice[] }) {
  const [selected, setSelected] = useState(0);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const invoice = invoices[selected] ?? invoices[0];
  const data = invoice?.data;
  function warningProps(field: string) {
    const matches = (invoice?.warnings ?? []).map((warning, index) => ({ warning, index }))
      .filter(({ warning }) => {
        const path = warning.field.replace(/^data\./, "").replace(/\.(\d+)(?=\.|$)/g, "[$1]");
        return field === path || field.startsWith(`${path}.`) || field.startsWith(`${path}[`);
      });
    return matches.length ? {
      className: "field-warning",
      title: matches.map(({ warning }) => warning.message).join("\n"),
      "aria-describedby": matches.map(({ index }) => `invoice-warning-${index}`).join(" "),
    } : {};
  }
  return <main className="workspace">
    <header className="topbar"><div className="brand">G<span>GARNIER INDUSTRIE</span></div><span className="eyebrow">COMPTABILITÉ · FOURNISSEURS</span></header>
    <section className="heading"><div><p className="eyebrow">EXTRACTION DOCUMENTAIRE</p><h1>Revue des factures</h1><p>Consultez les données extraites et les points à vérifier.</p></div>
      <button className="refresh" disabled={pending} onClick={() => startTransition(() => router.refresh())}>{pending ? "Actualisation…" : "↻ Actualiser"}</button>
    </section>
    <section className="stats" aria-label="Résumé">
      <div><strong>{invoices.length}</strong><span>Factures traitées</span></div>
      <div><strong>{invoices.filter(i => state(i) === "review").length}</strong><span>À vérifier</span></div>
      <div><strong>{invoices.filter(i => state(i) === "failure").length}</strong><span>En échec</span></div>
    </section>
    <p className="note">« Sans alerte » ne garantit pas l’exactitude. Comparez les données avec la facture originale.</p>
    {!invoice ? <section className="empty"><h2>Aucune facture disponible</h2><p>Les résultats apparaîtront ici après le premier traitement.</p><p>Actualisez cette page lorsque les résultats sont prêts.</p></section> :
      <div className="review-layout" aria-busy={pending}>
        <aside className="invoice-list" aria-label="Factures"><div className="section-label">DOCUMENTS <span>{invoices.length}</span></div>
          {invoices.map((item, index) => <button key={`${item.source_file}-${index}`} aria-pressed={invoice === item} className={`invoice-button ${invoice === item ? "selected" : ""}`} onClick={() => setSelected(index)}>
            <span className="list-title">{item.data?.supplier_name ?? "Fournisseur à vérifier"}</span>
            <span className="filename">{item.source_file}</span>
            <span className="list-bottom"><span className={`badge ${state(item)}`}>{labels[state(item)]}</span><strong>{item.data ? value(item.data.total_ttc, true) : "—"}</strong></span>
          </button>)}
        </aside>
        <article className="detail" aria-label="Détail de la facture">
          <div className="detail-header"><div><p className="eyebrow">DOCUMENT SÉLECTIONNÉ</p><h2 {...warningProps("supplier_name")}>{data?.supplier_name ?? "Facture à vérifier"}</h2><p className="filename">Source : {invoice.source_file}</p></div><span className={`badge ${state(invoice)}`}>{labels[state(invoice)]}</span></div>
          {invoice.status === "failure" ? <div className="error-box" role="alert"><h3>Traitement impossible</h3><p>{invoice.error}</p></div> : data && <>
            <dl className="metadata"><div><dt>Numéro de facture</dt><dd {...warningProps("invoice_number")}>{value(data.invoice_number)}</dd></div><div><dt>Date d’émission</dt><dd {...warningProps("invoice_date")}>{value(data.invoice_date)}</dd></div><div><dt>Fournisseur</dt><dd {...warningProps("supplier_name")}>{value(data.supplier_name)}</dd></div></dl>
            <h3 {...warningProps("items")}>Articles et prestations</h3>
            {data.items === null ? <p>{missing} — lignes non disponibles.</p> : data.items.length === 0 ? <p>Aucune ligne extraite.</p> : <div className="table-scroll"><table><thead><tr><th>Description</th><th>Quantité</th><th>Prix unitaire HT</th><th>Total HT</th></tr></thead><tbody>{data.items.map((item, i) => <tr key={i}><td {...warningProps(`items[${i}].description`)}>{value(item.description)}</td><td {...warningProps(`items[${i}].quantity`)}>{value(item.quantity)}</td><td {...warningProps(`items[${i}].unit_price`)}>{value(item.unit_price, true)}</td><td {...warningProps(`items[${i}].total`)}>{value(item.total, true)}</td></tr>)}</tbody></table></div>}
            <h3 {...warningProps("taxes")}>TVA</h3>
            {data.taxes === null ? <p>{missing} — détail de TVA non disponible.</p> : data.taxes.length === 0 ? <p>Aucune TVA applicable déclarée dans le résultat.</p> : <div className="table-scroll"><table><thead><tr><th>Taux</th><th>Base imposable</th><th>Montant TVA</th></tr></thead><tbody>{data.taxes.map((tax, i) => <tr key={i}><td {...warningProps(`taxes[${i}].rate`)}>{tax.rate === null ? missing : `${number.format(tax.rate)} %`}</td><td {...warningProps(`taxes[${i}].taxable_base`)}>{value(tax.taxable_base, true)}</td><td {...warningProps(`taxes[${i}].amount`)}>{value(tax.amount, true)}</td></tr>)}</tbody></table></div>}
            <div className="totals"><div {...warningProps("total_ht")}><span>Total HT</span><strong>{value(data.total_ht, true)}</strong></div><div {...warningProps("total_ttc")}><span>Total TTC</span><strong>{value(data.total_ttc, true)}</strong></div></div>
            <section className="warnings"><h3>Points de vigilance <span className="count">{invoice.warnings.length}</span></h3>
              {hasNull(data) && <p className="null-note">Certaines valeurs sont absentes. Les champs « À vérifier » nécessitent une vérification sur l’original.</p>}
              {invoice.warnings.length === 0 ? <p>Aucune alerte remontée par le traitement.</p> : <ul>{invoice.warnings.map((warning, i) => <li key={i} id={`invoice-warning-${i}`}><div><strong>{warningLabels[warning.code]}</strong><code>{warning.field}</code></div><p>{warning.message}</p></li>)}</ul>}
            </section>
          </>}
        </article>
      </div>}
    <footer>GARNIER Industrie <span>Revue assistée · Montants en EUR</span></footer>
  </main>;
}
