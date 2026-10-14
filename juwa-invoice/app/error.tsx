"use client";

export default function ErrorPage({ retry }: { retry: () => void }) {
  return <main className="workspace"><section className="empty" role="alert"><h1>Chargement impossible</h1><p>Les résultats ne sont pas accessibles. Réessayez dans un instant.</p><button className="refresh" onClick={retry}>Réessayer</button></section></main>;
}
